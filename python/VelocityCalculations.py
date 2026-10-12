import pandas as pd
import numpy as np
from scipy.signal import find_peaks
import matplotlib.pyplot as plt
from scipy.integrate import cumulative_trapezoid
import ValidatePeaks as ValidatePeaks

def calculate_velocity(magnitude_filtered, t_sec, valid_peaks, window_size=7):
    all_repetition_acceleration = []
    all_repetition_time = []
    all_repetition_velocity = []

    average_velocities = []
    peak_velocities = []

    # Need at least two peaks to define one repetition

    if len(valid_peaks) < 2:

        print(
            "\nNot enough peaks to calculate "
            "repetitions."
        )

        return {
            "all_acceleration": all_repetition_acceleration,
            "all_time": all_repetition_time,
            "all_velocity": all_repetition_velocity,
            "average_velocities": average_velocities,
            "peak_velocities": peak_velocities,
        }


    # Filter acceleration with moving average:
    magnitude_filtered = np.convolve(magnitude_filtered, np.ones(window_size) / window_size, 'same') 
    
    
    mean_acceleration = np.mean(magnitude_filtered)

    for rep_number in range(len(valid_peaks)):
        """
        # ----------------------------------------------------
        # Start and stop of this repetition
        # ----------------------------------------------------

        if rep_number == 0:
            # First repetition:
            # Start from the beginning of the measurement
            start = 0
            stop = valid_peaks[0]
        else:
            # Following repetitions:
            # Start at previous detected peak, stop at current peak
            start = valid_peaks[rep_number - 1]
            stop = valid_peaks[rep_number]
        """
        # ----------------------------------------------------
        # Extract acceleration and time
        # ----------------------------------------------------

        #repetition = magnitude_filtered[start:stop]
        #repetition_time = t_sec[start:stop]

        # ----------------------------------------------------
        # Find increasing acceleration section (stigningsfase)
        # ----------------------------------------------------

        start = valid_peaks[rep_number]
        stop = start

        acceleration = []

        while magnitude_filtered[start] >= mean_acceleration:
            acceleration.append(magnitude_filtered[start])
            start = start - 1

        acceleration = acceleration[::-1]
        
        while magnitude_filtered[stop] >= mean_acceleration: 
            acceleration.append(magnitude_filtered[stop])
            stop = stop + 1

        time_stamps = t_sec[start:stop]
        acceleration = acceleration - mean_acceleration

        acceleration = np.array(acceleration)
        time_stamps = np.array(time_stamps)



        if len(acceleration) < 2:
            print(f"\nRepetition {rep_number + 1}: Not enough acceleration data.")
            continue

        # ----------------------------------------------------
        # Calculate velocity
        # ----------------------------------------------------

        velocity = cumulative_trapezoid(acceleration, time_stamps, initial=0)
        average_velocity = np.mean(np.abs(velocity))
        peak_velocity = np.max(np.abs(velocity))

        all_repetition_acceleration.append(acceleration)
        all_repetition_time.append(time_stamps)
        all_repetition_velocity.append(velocity)
        average_velocities.append(average_velocity)
        peak_velocities.append(peak_velocity)

        plt.plot(time_stamps, acceleration, label="acceleration")
        plt.plot(time_stamps, velocity, label="velocity")
        plt.legend()
        plt.show()
        
        # ----------------------------------------------------
        # Print results
        # ----------------------------------------------------

        print(f"\nRepetition {rep_number + 1}")
        print(f"Peak start: {t_sec[start]:.3f} s")
        print(f"Peak end: {t_sec[stop]:.3f} s")
        print(f"Acceleration samples: {len(acceleration)}")
        print(f"Peak velocity: {peak_velocity:.4f}")
        print(f"Mean velocity: {average_velocity:.4f}")


    return {
        "all_acceleration": all_repetition_acceleration,
        "all_time": all_repetition_time,
        "all_velocity": all_repetition_velocity,
        "average_velocities": average_velocities,
        "peak_velocities": peak_velocities,
    }

def calculate_velocity2(magnitude_filtered, t_sec, valid_peaks, window_size=7):
    all_repetition_acceleration = []
    all_repetition_time = []
    all_repetition_velocity = []

    average_velocities = []
    peak_velocities = []

    # Filter acceleration with moving average:
    magnitude_filtered = np.convolve(magnitude_filtered, np.ones(window_size) / window_size, 'same') 
    mean_acceleration = np.mean(magnitude_filtered[104:208])
    #mean_acceleration = -9.8
    velocity = cumulative_trapezoid(magnitude_filtered - mean_acceleration, t_sec, initial=0)
    k = (np.mean(velocity[-10:]) - np.mean(velocity[:10]))/(t_sec[-1] - t_sec[0])
    y = k*t_sec

    diff = velocity - y
    crossings = []
    i = 0
    reps = 11
    while i < (len(velocity)-1):
        if velocity[i] < -0.25:
            break
        else:
            i += 1
    while i < (len(diff) -1):
        if(abs(diff[i]) < 0.05):
            crossings.append(i)
            i += 25
        else:
            i +=1
        if(len(crossings) >= reps*2):
            break
    print(len(crossings))
    plt.plot(t_sec, y)
    plt.plot(t_sec, velocity)
    plt.plot(t_sec[crossings], diff[crossings], 'x', markersize=10)
    plt.plot(t_sec, diff)
    plt.show()

    j = 0
    while j < (len(crossings)-1):
        crossA = crossings[j]
        crossB = crossings[j+1]
        print("-----")
        print("Mean: ", np.mean(diff[crossA:crossB]))
        print("Peak: ", np.max(diff[crossA:crossB]))
        j += 2



    print("Mean acceleration: ", mean_acceleration)

    for rep_number in range(len(valid_peaks)):
        start = valid_peaks[rep_number]
        stop = start

        acceleration = []

        while magnitude_filtered[start] >= mean_acceleration:
            acceleration.append(magnitude_filtered[start] - mean_acceleration)
            start = start - 1

        acceleration = acceleration[::-1]
        
        while magnitude_filtered[stop] >= mean_acceleration: 
            acceleration.append(magnitude_filtered[stop] - mean_acceleration)
            stop = stop + 1

        time_stamps = t_sec[start:stop]
        velocity = cumulative_trapezoid(acceleration, time_stamps, initial=0)
        while(velocity[-1] >= 0.1):
            stop += 1
            if(stop >= len(magnitude_filtered) -1):
                break
            time_stamps = t_sec[start:stop]
            acceleration.append(magnitude_filtered[stop] - mean_acceleration)
            velocity = cumulative_trapezoid(acceleration, time_stamps, initial=0)

        acceleration = np.array(acceleration)
        time_stamps = np.array(time_stamps)



        if len(acceleration) < 2:
            print(f"\nRepetition {rep_number + 1}: Not enough acceleration data.")
            continue

        # ----------------------------------------------------
        # Calculate velocity
        # ----------------------------------------------------

        velocity = cumulative_trapezoid(acceleration, time_stamps, initial=0)
        average_velocity = np.mean(np.abs(velocity))
        
        peak_velocity = np.max(np.abs(velocity))

        all_repetition_acceleration.append(acceleration)
        all_repetition_time.append(time_stamps)
        all_repetition_velocity.append(velocity)
        average_velocities.append(average_velocity)
        peak_velocities.append(peak_velocity)


        # Plot results:
        plt.plot(time_stamps, acceleration, label="acceleration")
        plt.plot(time_stamps, velocity, label="velocity")
        plt.legend()
        plt.show()
        # ----------------------------------------------------
        # Print results
        # ----------------------------------------------------

        print(f"\nRepetition {rep_number + 1}")
        print(f"Peak start: {t_sec[start]:.3f} s")
        print(f"Peak end: {t_sec[stop]:.3f} s")
        print(f"Acceleration samples: {len(acceleration)}")
        print(f"Peak velocity: {peak_velocity:.4f}")
        print(f"Mean velocity: {average_velocity:.4f}")


    return {
        "all_acceleration": all_repetition_acceleration,
        "all_time": all_repetition_time,
        "all_velocity": all_repetition_velocity,
        "average_velocities": average_velocities,
        "peak_velocities": peak_velocities,
    }

def calculate_velocity3(magnitude_filtered, t_sec, reps, window_size=7, plot=False):
    all_repetition_acceleration = []
    all_repetition_time = []
    all_repetition_velocity = []

    average_velocities = []
    peak_velocities = []

    # Filter acceleration with moving average:
    magnitude_filtered = np.convolve(magnitude_filtered, np.ones(window_size) / window_size, 'same') 

    #Average of the acceleration on 1-2s
    mean_acceleration = np.mean(magnitude_filtered[104:208])
    #mean_acceleration = -9.8
    print("Mean acceleration: ", mean_acceleration)


    # Calculate the velocity by integration
    velocity = cumulative_trapezoid(magnitude_filtered - mean_acceleration, t_sec, initial=0)

    # Assume the drift is linear.
    k = (np.mean(velocity[-10:]) - np.mean(velocity[:10]))/(t_sec[-1] - t_sec[0])
    #m = np.mean(velocity[104:208]) - velocity[0]
    y = k*t_sec #+ m
    diff = velocity - y
    crossings = []
    i = 0
    while i < (len(diff)-1):
        if diff[i] < -0.25:
            break
        else:
            i += 1
    while i < (len(diff) -1):
        if(abs(diff[i]) < 0.05):
            crossings.append(i)
            i += 25
        else:
            i +=1
        if(len(crossings) >= reps*2):
            break
    print(len(crossings))
    # Copied into Product-and-UI: plotting is optional so main.py doesn't stop
    # at a plot window (python main.py ... --plot turns it back on).
    if plot:
        plt.plot(t_sec, y)
        plt.plot(t_sec, velocity)
        plt.plot(t_sec[crossings], diff[crossings], 'x', markersize=10)
        plt.plot(t_sec, diff)
        plt.show()

    j = 0
    while j < (len(crossings)-1):
        crossA = crossings[j]
        crossB = crossings[j+1]
        average_velocities.append(np.mean(diff[crossA:crossB]))
        peak_velocities.append(np.max(diff[crossA:crossB]))
        all_repetition_acceleration.append(magnitude_filtered[crossA:crossB])
        all_repetition_time.append(t_sec[crossA:crossB])

        j += 2

    return {
        "all_acceleration": all_repetition_acceleration,
        "all_time": all_repetition_time,
        "all_velocity": all_repetition_velocity,
        "average_velocities": average_velocities,
        "peak_velocities": peak_velocities,
    }

