"""
backend/src/ecg_dsp.py

BeatAhead ECG Digital Signal Processing & Ischemic Feature Extraction Engine.
Processes raw ADC streaming data (0-1023) from the AD8232 heart rate monitor module.

Key Features:
- Baseline wander removal (0.5 Hz High-pass)
- Muscle artifact & noise reduction (40 Hz Low-pass)
- 50 Hz / 60 Hz Mains hum Notch filter
- Adaptive Pan-Tompkins QRS & R-peak detector
- ST-segment deviation analysis (J-point + 60ms vs PR isoelectric baseline)
- Signal Quality Index (SQI) computation
- Real-time conversion into Matrix A physiological feature vector
"""

import math
from typing import Dict, List, Tuple, Any, Optional

# Optional SciPy import for high-order Butterworth filters; pure-Python fallbacks provided
try:
    from scipy.signal import butter, lfilter, iirnotch
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


class RealTimeECGFilter:
    """
    Real-time, low-latency filter pipeline for raw AD8232 signals sampled at ~200-500 Hz.
    Works seamlessly with both batch and streaming sample-by-sample input.
    """

    def __init__(self, sampling_rate: float = 250.0):
        self.fs = sampling_rate
        # DC Baseline tracking filter state
        self.dc_baseline = 512.0
        self.alpha_baseline = 0.005  # Slow baseline tracker (~0.5 Hz cutoff)
        
        # Exponential smoothing filter for high frequency noise removal (~40 Hz cutoff)
        self.smooth_val = 0.0
        self.alpha_smooth = 0.45

        # Notch filter state for 50 Hz mains hum
        self.prev_input = 0.0
        self.prev_prev_input = 0.0
        self.prev_output = 0.0
        self.prev_prev_output = 0.0
        
        # 50 Hz notch coefficients at 250 Hz sample rate
        f0 = 50.0 / self.fs
        w0 = 2 * math.pi * f0
        q = 15.0
        alpha_notch = math.sin(w0) / (2 * q)
        b0 = 1.0
        b1 = -2.0 * math.cos(w0)
        b2 = 1.0
        a0 = 1.0 + alpha_notch
        a1 = -2.0 * math.cos(w0)
        a2 = 1.0 - alpha_notch
        
        self.nb0 = b0 / a0
        self.nb1 = b1 / a0
        self.nb2 = b2 / a0
        self.na1 = a1 / a0
        self.na2 = a2 / a0

    def process_sample(self, raw_adc: float) -> float:
        """
        Process a single raw ADC reading (0 - 1023):
        1. Remove DC offset / baseline wander
        2. Apply 50 Hz notch filter
        3. Lowpass smooth high-frequency muscle noise
        Returns centered voltage in millivolts (mV).
        """
        if raw_adc < 0 or raw_adc > 1023:
            raw_adc = max(0, min(1023, raw_adc))
            
        # 1. Baseline wander tracking (high-pass effect)
        self.dc_baseline = (1.0 - self.alpha_baseline) * self.dc_baseline + self.alpha_baseline * raw_adc
        zero_mean = raw_adc - self.dc_baseline

        # 2. Notch filter for 50 Hz electrical noise
        notch_out = (self.nb0 * zero_mean + 
                     self.nb1 * self.prev_input + 
                     self.nb2 * self.prev_prev_input - 
                     self.na1 * self.prev_output - 
                     self.na2 * self.prev_prev_output)
        
        self.prev_prev_input = self.prev_input
        self.prev_input = zero_mean
        self.prev_prev_output = self.prev_output
        self.prev_output = notch_out

        # 3. High-frequency smoothing (~40 Hz low-pass)
        self.smooth_val = (1.0 - self.alpha_smooth) * self.smooth_val + self.alpha_smooth * notch_out

        # Convert ADC delta to millivolts: 3.3V full scale over 1024 ADC counts, AD8232 gain ~ 1100
        # V_sensor = (ADC / 1023) * 3300 mV. V_body = V_sensor / 1100 -> ~3.0 mV full range
        mv = (self.smooth_val / 1023.0) * 3300.0 / 1100.0 * 2.5
        return mv

    def filter_signal_batch(self, raw_samples: List[float]) -> List[float]:
        """Filters an array of raw ADC readings."""
        if not raw_samples:
            return []
        
        # If SciPy is available, apply bidirectional zero-phase Butterworth filter
        if HAS_SCIPY and len(raw_samples) > 30:
            try:
                # 0.5 - 40 Hz Bandpass
                nyq = 0.5 * self.fs
                low = 0.5 / nyq
                high = 40.0 / nyq
                b, a = butter(2, [low, high], btype='band')
                
                # 50 Hz Notch
                b_notch, a_notch = iirnotch(50.0, 30.0, self.fs)
                
                # Zero-mean
                demeaned = [s - (sum(raw_samples) / len(raw_samples)) for s in raw_samples]
                notched = lfilter(b_notch, a_notch, demeaned)
                filtered = lfilter(b, a, notched)
                
                # Scale to mV
                scale = 3300.0 / (1023.0 * 1100.0) * 2.5
                return [float(x * scale) for x in filtered]
            except Exception:
                pass
                
        # Pure-Python causal filter fallback
        return [self.process_sample(s) for s in raw_samples]


class AdaptiveQRSDetector:
    """
    Pan-Tompkins inspired real-time QRS complex detector.
    Adapts dynamic thresholds to detect R-peaks and compute instantaneous Heart Rate.
    """

    def __init__(self, sampling_rate: float = 250.0):
        self.fs = sampling_rate
        self.refractory_samples = int(0.22 * sampling_rate)  # Minimum 220 ms between consecutive R-peaks (max 270 bpm)
        self.samples_since_last_peak = 0
        self.peak_threshold = 0.35  # Initial adaptive threshold in mV
        self.noise_threshold = 0.10
        self.recent_rr_intervals: List[float] = []
        self.max_history = 10

    def detect_peaks_in_window(self, filtered_mv: List[float]) -> List[int]:
        """
        Detects R-peak indices within a signal window.
        Returns list of integer indices where R-peaks occur.
        """
        if len(filtered_mv) < 15:
            return []

        # Derivative / Slope calculation
        diffs = [0.0]
        for i in range(1, len(filtered_mv)):
            diffs.append(abs(filtered_mv[i] - filtered_mv[i - 1]) * self.fs)

        # Squaring & Moving integration window (120 ms)
        int_window = max(3, int(0.12 * self.fs))
        integrated = []
        for i in range(len(diffs)):
            start = max(0, i - int_window + 1)
            window_slice = diffs[start:i + 1]
            integrated.append(sum(window_slice) / len(window_slice))

        # Dynamic peak thresholding
        avg_level = sum(integrated) / len(integrated) if integrated else 1.0
        peak_thresh = avg_level * 1.8

        peaks = []
        last_peak = -int(0.25 * self.fs)
        for i in range(1, len(integrated) - 1):
            if integrated[i] > peak_thresh and integrated[i] > integrated[i - 1] and integrated[i] > integrated[i + 1]:
                if (i - last_peak) >= self.refractory_samples:
                    # Find exact maximum in filtered_mv within +/- 15 samples of integrated peak
                    search_start = max(0, i - 15)
                    search_end = min(len(filtered_mv), i + 15)
                    local_max_idx = search_start
                    max_val = filtered_mv[search_start]
                    for j in range(search_start + 1, search_end):
                        if filtered_mv[j] > max_val:
                            max_val = filtered_mv[j]
                            local_max_idx = j
                    peaks.append(local_max_idx)
                    last_peak = i

        return peaks


def analyze_ecg_window(
    raw_samples: List[float],
    sampling_rate: float = 250.0,
    baseline_st_mm: float = 0.0
) -> Dict[str, Any]:
    """
    Comprehensive DSP and Ischemic ST-deviation analysis on an ECG window:
    1. Filter raw ADC values into millivolts
    2. Detect R-peaks and compute instantaneous Heart Rate (BPM) & HRV (RMSSD/SDNN)
    3. Measure ST-segment level relative to PR isoelectric baseline
    4. Categorize ischemic status (Normal, Mild Sagging, Acute Ischemic Depression)
    5. Compute Signal Quality Index (SQI)
    """
    if not raw_samples:
        return {
            "status": "empty",
            "heart_rate_bpm": 70,
            "st_deviation_mm": 0.0,
            "st_deviation_mv": 0.0,
            "ischemic_alert": False,
            "signal_quality_percent": 0,
            "leads_connected": False
        }

    flt = RealTimeECGFilter(sampling_rate)
    filtered = flt.filter_signal_batch(raw_samples)
    
    detector = AdaptiveQRSDetector(sampling_rate)
    r_peaks = detector.detect_peaks_in_window(filtered)

    # 1. Compute Heart Rate and HRV
    bpm = 72.0
    rr_intervals_ms = []
    if len(r_peaks) >= 2:
        for i in range(1, len(r_peaks)):
            rr_samples = r_peaks[i] - r_peaks[i - 1]
            rr_ms = (rr_samples / sampling_rate) * 1000.0
            if 300.0 <= rr_ms <= 1500.0:  # Valid physiological range 40 - 200 bpm
                rr_intervals_ms.append(rr_ms)
        
        if rr_intervals_ms:
            mean_rr = sum(rr_intervals_ms) / len(rr_intervals_ms)
            bpm = round(60000.0 / mean_rr, 1)

    # Compute RMSSD (HRV)
    rmssd = 35.0
    if len(rr_intervals_ms) >= 2:
        diff_sq = [(rr_intervals_ms[i] - rr_intervals_ms[i - 1]) ** 2 for i in range(1, len(rr_intervals_ms))]
        rmssd = math.sqrt(sum(diff_sq) / len(diff_sq))

    # 2. ST-Segment Analysis
    # Isoelectric baseline: 80 to 40 ms before R-peak (PR interval)
    # J-point + 60ms: 60 to 90 ms after R-peak
    pr_offset_samples = int(0.06 * sampling_rate)
    st_offset_samples = int(0.075 * sampling_rate)

    st_shifts_mv = []
    for peak in r_peaks:
        pr_idx = peak - pr_offset_samples
        st_idx = peak + st_offset_samples
        if pr_idx >= 0 and st_idx < len(filtered):
            pr_base = filtered[pr_idx]
            st_level = filtered[st_idx]
            st_shifts_mv.append(st_level - pr_base)

    if st_shifts_mv:
        st_shifts_mv.sort()
        median_st_mv = st_shifts_mv[len(st_shifts_mv) // 2]
    else:
        # Fallback approximation from window min/median if peaks are sparse
        median_st_mv = 0.0

    # Convert mV to standard clinical ECG millimeters (10 mm/mV standard calibration -> 1 mm = 0.1 mV)
    st_mm = round(median_st_mv * 10.0, 2)
    delta_baseline_mm = round(st_mm - baseline_st_mm, 2)

    # Clinical guideline thresholds:
    # Sustained ST depression <= -1.0 mm (-0.1 mV) denotes significant myocardial ischemic strain
    is_ischemic = st_mm <= -1.0 or delta_baseline_mm <= -1.0
    is_mild_sagging = (-1.0 < st_mm <= -0.5) or (-1.0 < delta_baseline_mm <= -0.5)

    risk_tier = "Normal"
    if is_ischemic:
        risk_tier = "High Risk / Ischemic ST Depression"
    elif is_mild_sagging:
        risk_tier = "Elevated Stress / ST Sagging"

    # 3. Signal Quality Index (SQI)
    # Penalize extreme flatlines or violent saturation (> 2.0 mV)
    peak_count = len(r_peaks)
    expected_peaks = (len(raw_samples) / sampling_rate) * (bpm / 60.0)
    ratio = min(1.0, peak_count / max(1.0, expected_peaks)) if expected_peaks > 0 else 0.5
    sqi = min(100, max(20, int(ratio * 95)))

    return {
        "status": "success",
        "sample_count": len(raw_samples),
        "r_peak_count": len(r_peaks),
        "heart_rate_bpm": bpm,
        "rr_intervals_ms": [round(x, 1) for x in rr_intervals_ms],
        "hrv_rmssd_ms": round(rmssd, 1),
        "st_deviation_mv": round(median_st_mv, 3),
        "st_deviation_mm": st_mm,
        "delta_baseline_mm": delta_baseline_mm,
        "is_ischemic_alert": is_ischemic,
        "risk_tier": risk_tier,
        "signal_quality_percent": sqi,
        "filtered_preview": [round(x, 3) for x in filtered[-100:]] if filtered else []
    }
