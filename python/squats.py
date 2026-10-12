"""squats.py — the data team's Squats.py as a function main.py can call.

Same steps, helpers and settings as Product-testing (data-team branch,
Python/Squats/Squats.py, commit 776cd7b). Only the start and the end differ:
  - input:  the session's samples (list of dicts) instead of reading a CSV
  - output: one dict per rep instead of output.json; plots only with plot=True
  - reps:   the reported rep count if given, otherwise the number of valid
            peaks (the original had reps=11 hard-coded)
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

import MagdwickFilter
import ValidatePeaks
import PeakDetection
import VelocityCalculations

VERSION = "Squats.py (data-team 776cd7b)"


def analyze(samples, reps=None, plot=False):
    # ============================================================
    # Samples -> table (was: pd.read_csv)
    # ============================================================

    data = pd.DataFrame(samples)
    for col in ["t", "x", "y", "z", "gx", "gy", "gz"]:
        data[col] = pd.to_numeric(data[col], errors="coerce")
    # Gyro is empty until the sensor's first gyro packet arrives.
    data[["gx", "gy", "gz"]] = data[["gx", "gy", "gz"]].fillna(0.0)

    # ============================================================
    # Separate left and right sensors
    # ============================================================

    left_data = data[data["sensor"] == "left"].sort_values("t").reset_index(drop=True)
    right_data = data[data["sensor"] == "right"].sort_values("t").reset_index(drop=True)
    if len(left_data) < 300 or len(right_data) < 300:
        raise ValueError(
            "Need a few seconds from both sensors (got %d left, %d right samples)."
            % (len(left_data), len(right_data)))

    t_left_sec = left_data["t"].to_numpy() - left_data["t"].iloc[0]
    t_right_sec = right_data["t"].to_numpy() - right_data["t"].iloc[0]

    # ============================================================
    # Sample rate
    # ============================================================

    sample_rate = 104.0  # Hz
    dt_left = 1.0 / sample_rate
    dt_right = 1.0 / sample_rate

    # ============================================================
    # Filter using magdwick filter
    # ============================================================

    earth_acceleration_left, magnitude_left_filtered = MagdwickFilter.madgwick_filter(
        left_data["x"].to_numpy(), left_data["y"].to_numpy(), left_data["z"].to_numpy(),
        left_data["gx"].to_numpy(), left_data["gy"].to_numpy(), left_data["gz"].to_numpy(),
        dt_left)
    earth_acceleration_right, magnitude_right_filtered = MagdwickFilter.madgwick_filter(
        right_data["x"].to_numpy(), right_data["y"].to_numpy(), right_data["z"].to_numpy(),
        right_data["gx"].to_numpy(), right_data["gy"].to_numpy(), right_data["gz"].to_numpy(),
        dt_right)

    # Invert (as in Squats.py)
    earth_acceleration_left = -earth_acceleration_left
    earth_acceleration_right = -earth_acceleration_right

    # ============================================================
    # Peaks
    # ============================================================

    peaks_right, _, _ = PeakDetection.peak_detection(
        earth_acceleration_right[:, 2], window_size=50, k=2, distance=100)
    peaks_left, _, _ = PeakDetection.peak_detection(
        earth_acceleration_left[:, 2], window_size=50, k=2, distance=100)

    valid_peaks_right = ValidatePeaks.validate_peaks(magnitude_right_filtered, peaks_right, sample_rate)
    valid_peaks_left = ValidatePeaks.validate_peaks(magnitude_left_filtered, peaks_left, sample_rate)

    warnings = []
    if len(valid_peaks_left) != len(valid_peaks_right):
        warnings.append("Left and right found a different number of peaks (%d vs %d)."
                        % (len(valid_peaks_left), len(valid_peaks_right)))

    rep_count = reps or len(valid_peaks_right)
    if not rep_count:
        warnings.append("No reps detected.")
        return {"reps": [], "warnings": warnings, "version": VERSION}

    # ============================================================
    # Velocity for every repetition
    # ============================================================

    WINDOW_SIZE = 15
    results_right = VelocityCalculations.calculate_velocity3(
        magnitude_right_filtered, t_right_sec, reps=rep_count, window_size=WINDOW_SIZE, plot=plot)
    results_left = VelocityCalculations.calculate_velocity3(
        magnitude_left_filtered, t_left_sec, reps=rep_count, window_size=WINDOW_SIZE, plot=plot)

    if plot:
        plot_peaks(t_right_sec, magnitude_right_filtered, valid_peaks_right,
                   t_left_sec, magnitude_left_filtered, valid_peaks_left)

    # ============================================================
    # One row per rep (was: output.json)
    # ============================================================

    count = max(len(results_left["average_velocities"]), len(results_right["average_velocities"]))
    rows = []
    for i in range(count):
        row = {"rep_index": i + 1, "metrics": {}}
        for side, res in (("left", results_left), ("right", results_right)):
            if i < len(res["average_velocities"]):
                row[side + "_mean_velocity"] = float(res["average_velocities"][i])
                row[side + "_peak_velocity"] = float(res["peak_velocities"][i])
                row["metrics"][side + "_start_s"] = float(res["all_time"][i][0])
                row["metrics"][side + "_end_s"] = float(res["all_time"][i][-1])
        rows.append(row)
    if count != rep_count:
        warnings.append("Expected %d reps (%s), velocity step found %d." % (
            rep_count, "reported" if reps else "detected peaks", count))
    return {"reps": rows, "warnings": warnings, "version": VERSION}


def plot_peaks(t_right_sec, magnitude_right, peaks_right, t_left_sec, magnitude_left, peaks_left):
    fig, (ax_right, ax_left) = plt.subplots(2, 1, figsize=(14, 10), sharex=True)
    for ax, t, mag, peaks, name in ((ax_right, t_right_sec, magnitude_right, peaks_right, "RIGHT"),
                                    (ax_left, t_left_sec, magnitude_left, peaks_left, "LEFT")):
        ax.plot(t, mag, label="Filtered acceleration")
        if len(peaks):
            ax.plot(t[peaks], mag[peaks], "x", markersize=10, label="Detected peaks")
        ax.set_ylabel("Acceleration [m/s²]")
        ax.set_title(name + " Sensor - Acceleration with Detected Peaks")
        ax.legend()
        ax.grid(True)
    ax_left.set_xlabel("Time [s]")
    plt.tight_layout()
    plt.show()
