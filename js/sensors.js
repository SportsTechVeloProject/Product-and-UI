/* sensors.js — Movesense over Web Bluetooth, the matching simulator, and the sensor panel.
   Part of V-Lo. Loaded as a plain script; see vlo.html for the order. */
"use strict";

/* ---------------- Movesense sensors over Web Bluetooth ---------------- */
// Ported from SportsTechVeloProject/MoveSenseCode (Website/JS/ble.js and
// simulate.js). Both transports expose the same four methods so the UI below
// never branches on real-vs-simulated, and a sample is always
// { sensor, device, t, recvAt, x, y, z } whichever one produced it.
//
// Web Bluetooth needs a secure context (https:// or localhost) and only
// exists in Chromium browsers — no Safari, so no iPhone. Opening this file
// straight off disk (file://) will not work either.

var MSBle = (function () {
  var SENSORDATA_SERVICE_UUID = "34802252-7185-4d5d-b431-630e7050e8f0";
  var COMMAND_CHAR_SUFFIX = "0001";
  var DATA_CHAR_SUFFIX = "0002";
  var CMD_SUBSCRIBE = 1;
  var RESP_COMMAND_RESULT = 1;
  var RESP_DATA = 2;
  var REF_ACC = 99;
  var RESOURCE_PATH = "/Meas/Acc";
  var SAMPLE_RATE_HZ = 104;

  var devices = {};
  // Labels mid-connect. Guards against overlapping gatt.connect() calls on
  // one device (a manual click racing auto-reconnect), which Chrome rejects
  // with "GATT operation already in progress".
  var connecting = {};
  var sampleHandler = function () {};
  var statusHandler = function () {};

  function isGattBusyError(err) {
    return err && err.name === "NotSupportedError" && /already in progress/i.test(err.message || "");
  }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function handleNotification(label, deviceName, event) {
    var value = event.target.value;
    if (value.byteLength < 2) return;
    var response = value.getUint8(0);
    var reference = value.getUint8(1);
    if (response === RESP_COMMAND_RESULT) return;
    if (response !== RESP_DATA || reference !== REF_ACC) return;

    var timestampMs = value.getUint32(2, true);
    var numSamples = (value.byteLength - 6) / 12;
    var recvAt = Date.now();
    for (var i = 0; i < numSamples; i++) {
      sampleHandler({
        sensor: label,
        device: deviceName,
        t: timestampMs / 1000.0 + i / SAMPLE_RATE_HZ,
        recvAt: recvAt,
        x: value.getFloat32(6 + i * 12, true),
        y: value.getFloat32(6 + i * 12 + 4, true),
        z: value.getFloat32(6 + i * 12 + 8, true)
      });
    }
  }

  function connectOnce(label) {
    var entry = devices[label];
    var device = entry.device;
    return device.gatt.connect()
      .then(function (server) {
        entry.server = server;
        return server.getPrimaryService(SENSORDATA_SERVICE_UUID);
      })
      .then(function (service) { return service.getCharacteristics(); })
      .then(function (characteristics) {
        var commandChar = null, dataChar = null;
        characteristics.forEach(function (char) {
          var suffix = char.uuid.slice(4, 8);
          if (suffix === COMMAND_CHAR_SUFFIX) commandChar = char;
          else if (suffix === DATA_CHAR_SUFFIX) dataChar = char;
        });
        if (!commandChar || !dataChar) {
          throw new Error("[" + label + "] sensordata-service characteristics not found");
        }
        entry.commandChar = commandChar;
        entry.dataChar = dataChar;
        return dataChar.startNotifications();
      })
      .then(function () {
        entry.dataChar.addEventListener("characteristicvaluechanged", function (event) {
          handleNotification(label, device.name, event);
        });
        var resource = RESOURCE_PATH + "/" + SAMPLE_RATE_HZ;
        var header = [CMD_SUBSCRIBE, REF_ACC];
        var body = Array.from(new TextEncoder().encode(resource));
        return entry.commandChar.writeValue(new Uint8Array(header.concat(body)));
      });
  }

  // One automatic retry: the "GATT operation already in progress" error the
  // Windows Bluetooth stack throws is usually transient and clears in ~1s.
  function connect(label) {
    if (connecting[label]) {
      return Promise.reject(new Error("[" + label + "] a connection attempt is already in progress"));
    }
    connecting[label] = true;
    return connectOnce(label)
      .catch(function (err) {
        if (!isGattBusyError(err)) throw err;
        return delay(800).then(function () { return connectOnce(label); });
      })
      .then(
        function (v) { delete connecting[label]; return v; },
        function (e) { delete connecting[label]; throw e; }
      );
  }

  function onDisconnected(label) {
    return function () {
      var entry = devices[label];
      if (!entry) return;
      if (entry.intentional) { statusHandler({ label: label, status: "disconnected" }); return; }
      statusHandler({ label: label, status: "reconnecting" });
      connect(label).then(
        function () { statusHandler({ label: label, status: "connected" }); },
        function (err) { statusHandler({ label: label, status: "error", message: String(err) }); }
      );
    };
  }

  function addSensor(label) {
    statusHandler({ label: label, status: "connecting" });
    // One requestDevice() per sensor: the browser picker can't multi-select,
    // which is why there are separate left and right connect buttons.
    return navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "Movesense" }],
      optionalServices: [SENSORDATA_SERVICE_UUID]
    }).then(function (device) {
      devices[label] = { device: device, intentional: false };
      device.addEventListener("gattserverdisconnected", onDisconnected(label));
      return connect(label).then(
        function () {
          statusHandler({ label: label, status: "connected" });
          return { label: label, deviceName: device.name };
        },
        function (err) {
          delete devices[label];
          statusHandler({ label: label, status: "error", message: String(err) });
          throw err;
        }
      );
    });
  }

  function disconnectSensor(label) {
    var entry = devices[label];
    if (!entry) return;
    entry.intentional = true;
    if (entry.device.gatt.connected) entry.device.gatt.disconnect();
    delete devices[label];
    statusHandler({ label: label, status: "disconnected" });
  }

  return {
    setSampleHandler: function (fn) { sampleHandler = fn; },
    setStatusHandler: function (fn) { statusHandler = fn; },
    addSensor: addSensor,
    disconnectSensor: disconnectSensor
  };
})();

var MSSim = (function () {
  var TICK_MS = 50;
  var SAMPLE_RATE_HZ = 104;
  var sensors = {};
  var sampleHandler = function () {};
  var statusHandler = function () {};

  function tick(label) {
    var entry = sensors[label];
    if (!entry) return;
    var samplesPerTick = Math.round((SAMPLE_RATE_HZ * TICK_MS) / 1000);
    var recvAt = Date.now();
    function noise() { return (Math.random() - 0.5) * 0.3; }
    for (var i = 0; i < samplesPerTick; i++) {
      entry.sampleIndex += 1;
      var t = entry.sampleIndex / SAMPLE_RATE_HZ;
      sampleHandler({
        sensor: label,
        device: "Simulated " + label,
        t: t,
        recvAt: recvAt,
        x: Math.sin(t * 1.3 + entry.phase) * 1.5 + noise(),
        y: noise(),
        z: 9.8 + noise()
      });
    }
  }

  function addSensor(label) {
    statusHandler({ label: label, status: "connecting" });
    return new Promise(function (resolve) {
      setTimeout(function () {
        sensors[label] = {
          sampleIndex: 0,
          phase: Math.random() * Math.PI * 2,
          timer: setInterval(function () { tick(label); }, TICK_MS)
        };
        statusHandler({ label: label, status: "connected" });
        resolve({ label: label, deviceName: "Simulated " + label });
      }, 150);
    });
  }

  function disconnectSensor(label) {
    var entry = sensors[label];
    if (!entry) return;
    clearInterval(entry.timer);
    delete sensors[label];
    statusHandler({ label: label, status: "disconnected" });
  }

  return {
    setSampleHandler: function (fn) { sampleHandler = fn; },
    setStatusHandler: function (fn) { statusHandler = fn; },
    addSensor: addSensor,
    disconnectSensor: disconnectSensor
  };
})();

/* ---------------- sensor panel ---------------- */
(function initSensors() {
  var STATUS_TEXT = {
    connecting: "connecting…",
    reconnecting: "sensor dropped, reconnecting…",
    connected: "connected",
    disconnected: "not connected",
    error: "connection failed"
  };

  var live = { left: null, right: null };   // latest sample per sensor
  var counts = { left: 0, right: 0 };       // samples since the last UI tick
  var status = { left: "disconnected", right: "disconnected" };
  var note = document.getElementById("sensorNote");
  var summary = document.getElementById("sensorSummary");

  function card(label) { return document.querySelector('.sensor-card[data-sensor="' + label + '"]'); }

  function transport() { return document.getElementById("simToggle").checked ? MSSim : MSBle; }

  function onSample(s) {
    live[s.sensor] = s;
    counts[s.sensor] += 1;
  }
  MSBle.setSampleHandler(onSample);
  MSSim.setSampleHandler(onSample);

  function applyStatus(evt) {
    status[evt.label] = evt.status;
    var c = card(evt.label);
    if (!c) return;
    c.dataset.status = evt.status;
    c.querySelector(".sensor-drop").hidden = evt.status !== "connected" && evt.status !== "reconnecting";
    if (evt.status === "disconnected" || evt.status === "error") {
      live[evt.label] = null;
      c.querySelector(".sensor-device").textContent = "—";
      c.querySelector(".sensor-readout").textContent = STATUS_TEXT[evt.status];
    }
    if (evt.status === "error" && evt.message) note.textContent = evt.label + ": " + evt.message;
    renderSummary();
  }
  MSBle.setStatusHandler(applyStatus);
  MSSim.setStatusHandler(applyStatus);

  function renderSummary() {
    var on = ["left", "right"].filter(function (l) { return status[l] === "connected"; });
    if (!on.length) summary.textContent = "No sensors connected";
    else if (on.length === 2) summary.textContent = "Both sleeves connected";
    else summary.textContent = on[0] === "left" ? "Left sleeve connected" : "Right sleeve connected";
  }

  // One repaint per second rather than per notification: the sensors push
  // ~104 samples/s each, which would otherwise thrash layout for no gain.
  setInterval(function () {
    ["left", "right"].forEach(function (label) {
      var c = card(label);
      if (!c) return;
      var s = live[label];
      var hz = counts[label];
      counts[label] = 0;
      if (!s) return;
      c.querySelector(".sensor-device").textContent = s.device || "—";
      c.querySelector(".sensor-readout").textContent =
        "x " + s.x.toFixed(2) + "   y " + s.y.toFixed(2) + "   z " + s.z.toFixed(2) + "   ·  " + hz + " Hz";
    });
  }, 1000);

  document.querySelectorAll("[data-connect]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var label = btn.dataset.connect;
      note.textContent = "";
      transport().addSensor(label).catch(function (err) {
        // A cancelled browser picker is a normal outcome, not a failure.
        if (err && err.name === "NotFoundError") { applyStatus({ label: label, status: "disconnected" }); return; }
        applyStatus({ label: label, status: "error", message: String(err && err.message || err) });
      });
    });
  });

  document.querySelectorAll("[data-disconnect]").forEach(function (btn) {
    btn.addEventListener("click", function () { transport().disconnectSensor(btn.dataset.disconnect); });
  });

  document.getElementById("simToggle").addEventListener("change", function () {
    ["left", "right"].forEach(function (l) {
      MSBle.disconnectSensor(l);
      MSSim.disconnectSensor(l);
    });
    var simulating = this.checked;
    // Simulated sensors need no Bluetooth, so the connect buttons come back
    // even on a browser that can't talk to real hardware.
    document.querySelectorAll("[data-connect]").forEach(function (b) {
      b.disabled = !simulating && !navigator.bluetooth;
    });
    note.textContent = simulating
      ? "Simulated sensors: fake but plausible accelerometer data through the same code path as real hardware."
      : unsupportedNote;
  });

  var unsupportedNote = "";
  if (!navigator.bluetooth) {
    unsupportedNote = "This browser has no Web Bluetooth, so real sensors can't connect. " +
      "It needs Chrome or Edge over https:// or localhost — Safari and Firefox don't support it at all. " +
      "Tick Simulate to try the flow without hardware.";
    document.querySelectorAll("[data-connect]").forEach(function (b) { b.disabled = true; });
  } else if (!window.isSecureContext) {
    unsupportedNote = "Web Bluetooth needs a secure context. Serve this page over https:// or from localhost — " +
      "opening the file directly won't let the sensors connect.";
  }
  note.textContent = unsupportedNote;

  renderSummary();
})();
