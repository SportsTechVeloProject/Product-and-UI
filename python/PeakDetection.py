##Detect Peaks Using moving average filter 
import pandas as pd
import numpy as np
import os
from scipy.signal import find_peaks
import matplotlib.pyplot as plt
from scipy.integrate import cumulative_trapezoid


def peak_detection(signal,
    window_size=50,
    k=0.5,
    distance=80
): 
    signal = np.asarray(signal)

    # ----------------------------------------------------
    # Compute the dynamic threshold
    # ----------------------------------------------------

    threshold = compute_threshold(
        signal,
        window_size=window_size,
        k=k
    )

    # ----------------------------------------------------
    # Detect peaks using the computed threshold
    # ----------------------------------------------------

    peaks, properties = find_peaks(
        signal,
        height=threshold,
        distance=distance
    )

    return peaks, properties, threshold


def compute_threshold(signal, window_size=50, k=0.5):
    signal = np.asarray(signal)

    # ----------------------------------------------------
    # Moving average (baseline) via a simple rolling mean
    # ----------------------------------------------------

    kernel = np.ones(window_size) / window_size
    moving_avg = np.convolve(signal, kernel, mode="same")

    # ----------------------------------------------------
    # How much the signal deviates from its own baseline
    # ----------------------------------------------------

    deviation = signal - moving_avg
    deviation_std = np.std(deviation)

    # ----------------------------------------------------
    # Threshold = typical baseline level + margin
    # ----------------------------------------------------

    threshold = np.mean(moving_avg) + k * deviation_std

    return threshold