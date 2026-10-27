import QtQuick
import QtQuick.Layouts
import Quickshell
import qs.Commons
import qs.Ui

// The bar menu: open, pin, full screen, refresh, bar position, quit.
// Keys O W F R Q run actions. 1 2 3 set the bar side. Arrows or j/k move,
// Enter runs, Esc closes.
Panel {
  id: panel
  moduleName: "io.github.karpage.oma-year"
  ipcTarget: "oma-year"

  required property var widget

  readonly property color fg: Color.popups.text
  readonly property color dim: Util.alpha(fg, 0.55)
  readonly property color accent: Color.accent
  readonly property string fontFamily: widget.bar ? widget.bar.fontFamily : Style.font.family
  readonly property int rowHeight: Style.space(40)
  // Quit uses the theme's red. Some themes map "red" to a soft tint of their
  // main colour; then fall back to a plain red so Quit still reads as danger.
  readonly property color danger: {
    var c = Color.urgent
    var reddish = c.hslSaturation > 0.25 && (c.hslHue < 0.06 || c.hslHue > 0.92)
    return reddish ? c : "#c8323c"
  }
  property int cursor: -1

  readonly property var actions: [
    { "key": "open", "enabled": true },
    { "key": "pin", "enabled": true },
    { "key": "fullscreen", "enabled": true },
    { "key": "refresh", "enabled": widget.pinned },
    { "key": "quit", "enabled": widget.running }
  ]

  onOpenedChanged: {
    cursor = -1
    if (opened) widget.checkAll()
  }

  function run(key) {
    widget.run(key)
    widget.close()
  }

  function move(step) {
    var n = actions.length
    var next = cursor
    for (var i = 0; i < n; i++) {
      next = next < 0 ? (step > 0 ? 0 : n - 1) : (next + step + n) % n
      if (actions[next].enabled) { cursor = next; return }
    }
  }

  component MenuRow: Item {
    id: row
    property int index: 0
    property string glyph: ""
    property string label: ""
    property string hint: ""
    property bool checked: false
    readonly property bool usable: panel.actions[index].enabled
    readonly property bool hot: usable && (mouse.containsMouse || panel.cursor === index)

    Layout.fillWidth: true
    implicitHeight: panel.rowHeight

    Rectangle {
      anchors.fill: parent
      color: row.hot ? Util.alpha(panel.accent, 0.14) : "transparent"
    }
    Rectangle {
      width: Style.space(2)
      height: parent.height
      color: panel.accent
      visible: row.hot
    }
    Text {
      id: glyphText
      x: Style.space(12)
      width: Style.space(18)
      anchors.verticalCenter: parent.verticalCenter
      horizontalAlignment: Text.AlignHCenter
      text: row.glyph
      color: !row.usable ? Util.alpha(panel.fg, 0.3) : (row.hot || row.checked ? panel.accent : panel.fg)
      font.family: panel.fontFamily
      font.pixelSize: Style.font.bodySmall + 1
    }
    Text {
      anchors.left: glyphText.right
      anchors.leftMargin: Style.space(8)
      anchors.verticalCenter: parent.verticalCenter
      text: row.label
      color: row.usable ? panel.fg : Util.alpha(panel.fg, 0.35)
      font.family: panel.fontFamily
      font.pixelSize: Style.font.bodySmall + 1
    }
    Rectangle {
      visible: row.checked
      anchors.right: hintText.left
      anchors.rightMargin: Style.space(10)
      anchors.verticalCenter: parent.verticalCenter
      width: Style.space(6)
      height: width
      radius: width / 2
      color: panel.accent
    }
    Text {
      id: hintText
      anchors.right: parent.right
      anchors.rightMargin: Style.space(12)
      anchors.verticalCenter: parent.verticalCenter
      text: row.hint
      color: row.usable ? panel.dim : Util.alpha(panel.fg, 0.25)
      font.family: panel.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
    MouseArea {
      id: mouse
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: row.usable ? Qt.PointingHandCursor : Qt.ArrowCursor
      onEntered: if (row.usable) panel.cursor = row.index
      onClicked: if (row.usable) panel.run(panel.actions[row.index].key)
    }
  }

  KeyboardPanel {
    id: kpanel
    anchorItem: panel.widget.anchorItem
    owner: panel.widget
    bar: panel.widget.bar
    open: panel.opened
    focusTarget: keyCatcher
    padding: 0
    borderSpec: Border.flat(panel.accent, 1)
    contentWidth: kpanel.fittedContentWidth(Style.space(360))
    contentHeight: kpanel.fittedContentHeight(content.implicitHeight, Style.space(560))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: panel.widget.close()
      onMoveRequested: function(dx, dy) { if (dy !== 0) panel.move(dy) }
      onActivateRequested: {
        if (panel.cursor >= 0 && panel.actions[panel.cursor].enabled) panel.run(panel.actions[panel.cursor].key)
      }
      onTextKey: function(t) {
        var sideKeys = { "1": "left", "2": "center", "3": "right" }
        if (sideKeys[t]) {
          panel.widget.setBarSide(sideKeys[t])
          return
        }
        var keys = { "o": "open", "w": "pin", "f": "fullscreen", "r": "refresh", "q": "quit" }
        var key = keys[t.toLowerCase()]
        if (!key) return
        for (var i = 0; i < panel.actions.length; i++) {
          if (panel.actions[i].key === key && panel.actions[i].enabled) panel.run(key)
        }
      }

      ColumnLayout {
        id: content
        anchors.left: parent.left
        anchors.right: parent.right
        spacing: Style.space(6)

        // Header
        Item {
          Layout.fillWidth: true
          implicitHeight: Style.space(44)
          Text {
            id: headGlyph
            x: Style.space(12)
            width: Style.space(18)
            anchors.verticalCenter: parent.verticalCenter
            horizontalAlignment: Text.AlignHCenter
            text: "\uf073"
            color: panel.accent
            font.family: panel.fontFamily
            font.pixelSize: Style.font.bodySmall + 1
          }
          Text {
            anchors.left: headGlyph.right
            anchors.leftMargin: Style.space(8)
            anchors.verticalCenter: parent.verticalCenter
            text: "OMA YEAR"
            color: panel.fg
            font.family: panel.fontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 2
          }
          Text {
            anchors.right: parent.right
            anchors.rightMargin: Style.space(12)
            anchors.verticalCenter: parent.verticalCenter
            text: panel.widget.pinned ? "PINNED" : (panel.widget.running ? "RUNNING" : "")
            color: panel.widget.pinned ? panel.accent : panel.dim
            font.family: panel.fontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 1.5
          }
        }
        Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Util.alpha(panel.accent, 0.35) }

        MenuRow { index: 0; glyph: "\uf08e"; label: "Open planner"; hint: "O" }
        MenuRow {
          index: 1
          glyph: "\uf08d"
          label: panel.widget.pinned ? "Unpin from desktop" : "Pin to desktop"
          hint: "W"
          checked: panel.widget.pinned
        }
        MenuRow {
          index: 2
          glyph: panel.widget.fullscreen ? "\uf066" : "\uf065"
          label: panel.widget.fullscreen ? "Exit full screen" : "Full screen"
          hint: "F"
        }
        MenuRow { index: 3; glyph: "\uf021"; label: "Refresh desktop snapshot"; hint: "R" }

        ColumnLayout {
          Layout.fillWidth: true
          Layout.leftMargin: Style.space(12)
          Layout.rightMargin: Style.space(12)
          Layout.topMargin: Style.space(4)
          Layout.bottomMargin: Style.space(4)
          spacing: Style.space(8)
          Text {
            text: "Bar position"
            color: panel.fg
            font.family: panel.fontFamily
            font.pixelSize: Style.font.bodySmall + 1
          }
          RowLayout {
            Layout.fillWidth: true
            spacing: -1
            Repeater {
              model: [
                { "side": "left", "label": "Left", "hint": "1" },
                { "side": "center", "label": "Center", "hint": "2" },
                { "side": "right", "label": "Right", "hint": "3" }
              ]
              delegate: Rectangle {
                required property var modelData
                Layout.fillWidth: true
                implicitHeight: Style.space(40)
                radius: 0
                border.width: 1
                border.color: panel.widget.barSide === modelData.side ? panel.accent : Util.alpha(panel.fg, 0.45)
                color: panel.widget.barSide === modelData.side ? panel.accent : "transparent"
                Text {
                  anchors.centerIn: parent
                  text: modelData.label
                  color: panel.widget.barSide === modelData.side ? "#04140c" : panel.fg
                  font.family: panel.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  font.bold: panel.widget.barSide === modelData.side
                }
                MouseArea {
                  anchors.fill: parent
                  cursorShape: Qt.PointingHandCursor
                  onClicked: panel.widget.setBarSide(modelData.side)
                }
              }
            }
          }
        }

        Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Util.alpha(panel.fg, 0.12) }

        // Quit: a quiet outlined danger button. Faint red tint at rest,
        // stronger tint and a full red border on hover or press.
        Item {
          Layout.fillWidth: true
          implicitHeight: panel.rowHeight + Style.space(28)
          Rectangle {
            id: quitButton
            readonly property bool usable: panel.actions[4].enabled
            readonly property bool hot: usable && (quitMouse.containsMouse || panel.cursor === 4)
            readonly property bool down: usable && quitMouse.pressed
            readonly property color ink: panel.danger
            anchors.fill: parent
            anchors.leftMargin: Style.space(12)
            anchors.rightMargin: Style.space(12)
            anchors.topMargin: Style.space(10)
            anchors.bottomMargin: Style.space(10)
            radius: 0
            color: !usable ? "transparent"
                 : Util.alpha(panel.danger, down ? 0.28 : (hot ? 0.18 : 0.08))
            border.width: 1
            border.color: !usable ? Util.alpha(panel.fg, 0.15)
                        : (hot ? panel.danger : Util.alpha(panel.danger, 0.65))
            Text {
              id: quitGlyph
              x: Style.space(6)
              width: Style.space(18)
              anchors.verticalCenter: parent.verticalCenter
              horizontalAlignment: Text.AlignHCenter
              text: "\uf011"
              color: quitButton.usable ? panel.danger : Util.alpha(panel.fg, 0.3)
              font.family: panel.fontFamily
              font.pixelSize: Style.font.bodySmall + 1
            }
            Text {
              anchors.left: quitGlyph.right
              anchors.leftMargin: Style.space(8)
              anchors.verticalCenter: parent.verticalCenter
              text: quitButton.usable ? "Quit Year Planner" : "Not running"
              color: quitButton.usable ? quitButton.ink : Util.alpha(panel.fg, 0.35)
              font.family: panel.fontFamily
              font.pixelSize: Style.font.bodySmall + 1
            }
            Text {
              anchors.right: parent.right
              anchors.rightMargin: Style.space(6)
              anchors.verticalCenter: parent.verticalCenter
              visible: quitButton.usable
              text: "Q"
              color: quitButton.hot ? quitButton.ink : Util.alpha(panel.danger, 0.45)
              font.family: panel.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
            }
            MouseArea {
              id: quitMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: quitButton.usable ? Qt.PointingHandCursor : Qt.ArrowCursor
              onEntered: if (quitButton.usable) panel.cursor = 4
              onClicked: if (quitButton.usable) panel.run("quit")
            }
          }
        }

        Text {
          Layout.fillWidth: true
          Layout.topMargin: Style.space(4)
          Layout.bottomMargin: Style.space(14)
          horizontalAlignment: Text.AlignHCenter
          text: "RIGHT-CLICK ICON · QUICK PIN"
          color: Util.alpha(panel.fg, 0.4)
          font.family: panel.fontFamily
          font.pixelSize: Style.font.caption - 1
          font.letterSpacing: 1
        }
      }
    }
  }
}
