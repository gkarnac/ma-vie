import Toybox.ActivityMonitor;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;
import Toybox.Sensor;

// Alien / Weyland-Yutani watch face for Garmin Venu Sq 2 (320x360)
class AlienWatchFaceView extends WatchUi.WatchFace {

    // Colors
    const COLOR_BG        = 0x000000;
    const COLOR_GREEN     = 0x00FF41;
    const COLOR_DIM_GREEN = 0x007A1F;
    const COLOR_MID_GREEN = 0x00C030;
    const COLOR_WHITE     = 0xFFFFFF;
    const COLOR_DARK_BG   = 0x050F05;

    // Layout constants for 320x360
    const CX = 160;
    const CY = 180;
    const W  = 320;
    const H  = 360;

    var _bodyBattery as Number = 0;
    var _heartRate   as Number = 0;
    var _battery     as Number = 0;

    function initialize() {
        WatchFace.initialize();
    }

    function onLayout(dc as Graphics.Dc) as Void {
        setLayout(Rez.Layouts.WatchFace(dc));
    }

    function onShow() as Void {}

    function onUpdate(dc as Graphics.Dc) as Void {
        _readSensors();

        dc.setColor(COLOR_BG, COLOR_BG);
        dc.clear();

        _drawBackground(dc);
        _drawXenomorphSilhouette(dc);
        _drawTitle(dc);
        _drawBodyBattery(dc);
        _drawHeartRate(dc);
        _drawTime(dc);
        _drawDateLine(dc);
        _drawBatteryWidget(dc);
        _drawDateWidget(dc);
        _drawTeeth(dc);
    }

    function onHide() as Void {}

    // ──────────────────────────────────────────────────────
    // Data helpers
    // ──────────────────────────────────────────────────────

    function _readSensors() as Void {
        var info = ActivityMonitor.getInfo();
        if (info has :bodyBatteryHistory && info.bodyBatteryHistory != null) {
            var history = info.bodyBatteryHistory;
            if (history.size() > 0) {
                var val = history[0];
                _bodyBattery = (val != null) ? val : 0;
            }
        }

        var sensor = Sensor.getInfo();
        if (sensor != null && sensor.heartRate != null) {
            _heartRate = sensor.heartRate;
        }

        var sys = System.getSystemStats();
        _battery = sys.battery.toNumber();
    }

    // ──────────────────────────────────────────────────────
    // Drawing helpers
    // ──────────────────────────────────────────────────────

    function _drawBackground(dc as Graphics.Dc) as Void {
        // Radial dark-green vignette effect using concentric ellipses
        var steps = 8;
        for (var i = steps; i > 0; i--) {
            var ratio = i.toFloat() / steps;
            var r = (ratio * 60).toNumber();
            var g = (ratio * 20).toNumber();
            var b = 0;
            dc.setColor(Graphics.makeRGBColor(r, g, b), Graphics.COLOR_TRANSPARENT);
            var rx = (CX * ratio * 1.4).toNumber();
            var ry = (CY * ratio * 1.4).toNumber();
            dc.fillEllipse(CX, CY, rx, ry);
        }
    }

    function _drawXenomorphSilhouette(dc as Graphics.Dc) as Void {
        // Stylised Xenomorph skull outline drawn with polygons
        // Elongated head
        dc.setColor(0x051005, Graphics.COLOR_TRANSPARENT);

        // Outer head shape
        var headPts = [
            [CX, 55],
            [CX + 28, 72],
            [CX + 34, 100],
            [CX + 30, 130],
            [CX + 20, 148],
            [CX, 158],
            [CX - 20, 148],
            [CX - 30, 130],
            [CX - 34, 100],
            [CX - 28, 72]
        ] as Array<Array<Number>>;
        dc.fillPolygon(headPts);

        // Eye sockets — glowing slits
        dc.setColor(COLOR_DIM_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.fillEllipse(CX - 12, 108, 10, 4);
        dc.fillEllipse(CX + 12, 108, 10, 4);

        // Neck / torso
        dc.setColor(0x041004, Graphics.COLOR_TRANSPARENT);
        var bodyPts = [
            [CX - 18, 158],
            [CX + 18, 158],
            [CX + 26, 200],
            [CX + 22, 240],
            [CX, 260],
            [CX - 22, 240],
            [CX - 26, 200]
        ] as Array<Array<Number>>;
        dc.fillPolygon(bodyPts);

        // Inner cranium highlight
        dc.setColor(0x082008, Graphics.COLOR_TRANSPARENT);
        var innerPts = [
            [CX, 62],
            [CX + 18, 76],
            [CX + 22, 100],
            [CX + 18, 128],
            [CX, 136],
            [CX - 18, 128],
            [CX - 22, 100],
            [CX - 18, 76]
        ] as Array<Array<Number>>;
        dc.fillPolygon(innerPts);
    }

    function _drawTitle(dc as Graphics.Dc) as Void {
        // "ALIEN" in large spaced letters
        dc.setColor(COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(CX, 10, Graphics.FONT_MEDIUM, "A L I E N", Graphics.TEXT_JUSTIFY_CENTER);

        // Weyland-Yutani Corp subtitle
        dc.setColor(COLOR_DIM_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(CX, 32, Graphics.FONT_XTINY, "WEYLAND-YUTANI CORP", Graphics.TEXT_JUSTIFY_CENTER);

        // W logo (simplified: two V shapes)
        _drawWLogo(dc, CX, 56);
    }

    function _drawWLogo(dc as Graphics.Dc, x as Number, y as Number) as Void {
        dc.setColor(COLOR_MID_GREEN, Graphics.COLOR_TRANSPARENT);
        var pts = [
            [x - 12, y - 6],
            [x - 8,  y + 6],
            [x,      y - 2],
            [x + 8,  y + 6],
            [x + 12, y - 6],
            [x + 9,  y - 6],
            [x + 8,  y + 2],
            [x,      y - 6],
            [x - 8,  y + 2],
            [x - 9,  y - 6]
        ] as Array<Array<Number>>;
        dc.fillPolygon(pts);
    }

    function _drawBodyBattery(dc as Graphics.Dc) as Void {
        var cx = 68;
        var cy = 120;
        var r  = 32;

        // Outer ring
        dc.setColor(COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawCircle(cx, cy, r);

        // Arc fill proportional to body battery
        var endAngle = (_bodyBattery * 360 / 100) - 90;
        dc.setColor(COLOR_MID_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(3);
        dc.drawArc(cx, cy, r - 2, Graphics.ARC_COUNTER_CLOCKWISE, 270, endAngle);

        // Value
        dc.setColor(COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy - 10, Graphics.FONT_MEDIUM, _bodyBattery.toString(), Graphics.TEXT_JUSTIFY_CENTER);

        // Labels
        dc.setColor(COLOR_DIM_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 75, Graphics.FONT_XTINY, "BODY", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(cx, 86, Graphics.FONT_XTINY, "BATTERY", Graphics.TEXT_JUSTIFY_CENTER);
    }

    function _drawHeartRate(dc as Graphics.Dc) as Void {
        var cx = 252;
        var cy = 120;
        var r  = 32;

        // Outer ring
        dc.setColor(COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawCircle(cx, cy, r);

        // Heart icon
        _drawHeart(dc, cx, cy - 8, 8);

        // Value
        dc.setColor(COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy, Graphics.FONT_MEDIUM, _heartRate.toString(), Graphics.TEXT_JUSTIFY_CENTER);

        // Label
        dc.setColor(COLOR_DIM_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 75, Graphics.FONT_XTINY, "BPM", Graphics.TEXT_JUSTIFY_CENTER);
    }

    function _drawHeart(dc as Graphics.Dc, x as Number, y as Number, size as Number) as Void {
        dc.setColor(COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        // Two bumps + V bottom
        var pts = [
            [x,          y + size],
            [x - size,   y],
            [x - size/2, y - size/2],
            [x,          y - size/4],
            [x + size/2, y - size/2],
            [x + size,   y]
        ] as Array<Array<Number>>;
        dc.fillPolygon(pts);
    }

    function _drawTime(dc as Graphics.Dc) as Void {
        var now   = Time.now();
        var info  = Gregorian.info(now, Time.FORMAT_SHORT);
        var hours = info.hour.format("%02d");
        var mins  = info.min.format("%02d");

        // Shadow for depth
        dc.setColor(COLOR_DIM_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(CX + 1, 197, Graphics.FONT_NUMBER_HOT, hours + ":" + mins, Graphics.TEXT_JUSTIFY_CENTER);

        // Main time
        dc.setColor(COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(CX, 196, Graphics.FONT_NUMBER_HOT, hours + ":" + mins, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function _drawDateLine(dc as Graphics.Dc) as Void {
        var now  = Time.now();
        var info = Gregorian.info(now, Time.FORMAT_MEDIUM);

        var days = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];
        var months = ["JAN", "FÉV", "MAR", "AVR", "MAI", "JUN",
                      "JUL", "AOÛ", "SEP", "OCT", "NOV", "DÉC"];

        var dayStr   = days[info.day_of_week];
        var monthStr = months[info.month - 1];
        var dateStr  = dayDay(info.day) + " " + monthStr;
        var fullLine = dayStr + " " + dateStr;

        // Decorative lines either side
        dc.setColor(COLOR_DIM_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawLine(30, 256, 110, 256);
        dc.drawLine(210, 256, 290, 256);

        dc.setColor(COLOR_MID_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(CX, 244, Graphics.FONT_TINY, fullLine, Graphics.TEXT_JUSTIFY_CENTER);
    }

    function dayDay(d as Number) as String {
        return d.toString();
    }

    function _drawBatteryWidget(dc as Graphics.Dc) as Void {
        var cx = 68;
        var cy = 300;
        var r  = 28;

        // Circle border
        dc.setColor(COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawCircle(cx, cy, r);

        // Battery body
        var bx = cx - 14;
        var by = cy - 6;
        dc.drawRectangle(bx, by, 28, 12);
        dc.fillRectangle(bx + 28, by + 3, 4, 6);

        // Fill level
        var fillW = ((_battery * 24) / 100).toNumber();
        dc.setColor(COLOR_MID_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(bx + 2, by + 2, fillW, 8);

        // Percentage text
        dc.setColor(COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + 10, Graphics.FONT_XTINY, _battery.toString() + "%", Graphics.TEXT_JUSTIFY_CENTER);

        // Label
        dc.setColor(COLOR_DIM_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 265, Graphics.FONT_XTINY, "BATTERY", Graphics.TEXT_JUSTIFY_CENTER);
    }

    function _drawDateWidget(dc as Graphics.Dc) as Void {
        var cx = 252;
        var cy = 300;
        var r  = 28;

        var now    = Time.now();
        var info   = Gregorian.info(now, Time.FORMAT_SHORT);
        var months = ["JAN", "FÉV", "MAR", "AVR", "MAI", "JUN",
                      "JUL", "AOÛ", "SEP", "OCT", "NOV", "DÉC"];
        var monthStr = months[info.month - 1];

        // Circle border
        dc.setColor(COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawCircle(cx, cy, r);

        // Day number
        dc.setColor(COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy - 12, Graphics.FONT_MEDIUM, info.day.toString(), Graphics.TEXT_JUSTIFY_CENTER);

        // Month
        dc.setColor(COLOR_DIM_GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + 6, Graphics.FONT_XTINY, monthStr, Graphics.TEXT_JUSTIFY_CENTER);

        // Label
        dc.drawText(cx, 265, Graphics.FONT_XTINY, "DATE", Graphics.TEXT_JUSTIFY_CENTER);
    }

    function _drawTeeth(dc as Graphics.Dc) as Void {
        // Row of Xenomorph teeth along the bottom
        dc.setColor(COLOR_DIM_GREEN, Graphics.COLOR_TRANSPARENT);
        var toothW  = 18;
        var toothH  = 22;
        var gap     = 4;
        var count   = 8;
        var totalW  = count * toothW + (count - 1) * gap;
        var startX  = (W - totalW) / 2;
        var baseY   = H;

        for (var i = 0; i < count; i++) {
            var tx = startX + i * (toothW + gap);
            var tip = baseY - toothH - (i % 2) * 6; // alternating heights
            var pts = [
                [tx,           baseY],
                [tx + toothW,  baseY],
                [tx + toothW/2, tip]
            ] as Array<Array<Number>>;
            dc.fillPolygon(pts);
        }

        // Gum line
        dc.setColor(0x003010, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(3);
        dc.drawLine(0, H - 3, W, H - 3);
    }
}
