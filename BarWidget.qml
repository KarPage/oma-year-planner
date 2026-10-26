import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

// Bar button for Oma Year Planner. Left-click opens a small menu. Right-click
// or middle-click pins or unpins straight away. A dot shows while it is pinned.
BarWidget {
  id: root
  moduleName: "io.github.karpage.oma-year"

  readonly property string pluginDir: String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "").replace(/\/$/, "")
  readonly property string launcher: pluginDir + "/year-planner/open"
  readonly property string wallpaper: pluginDir + "/year-planner/wallpaper"
  readonly property string app: pluginDir + "/year-planner/app"

  property var anchorItem: button
  property bool pinned: false
  property bool running: false
  property bool fullscreen: false

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  readonly property bool opened: menu.opened
  function open() { menu.controller.show() }
  function close() { menu.controller.hide() }
  function toggle() { opened ? close() : open() }
  function closeForPopoutSwitch() { close() }
  readonly property bool popoutSwitchClosing: false

  function run(key) {
    if (key === "open") Quickshell.execDetached([launcher])
    else if (key === "pin") Quickshell.execDetached([wallpaper, "toggle"])
    else if (key === "refresh") Quickshell.execDetached([wallpaper, "refresh"])
    else if (key === "fullscreen") Quickshell.execDetached([app, "fullscreen"])
    else if (key === "quit") Quickshell.execDetached([app, "quit"])
    followUp.remaining = 4
    followUp.restart()
  }

  function checkAll() {
    if (!pinProc.running) pinProc.running = true
    if (!appProc.running) appProc.running = true
  }

  Component.onCompleted: checkAll()

  Process {
    id: pinProc
    command: [root.wallpaper, "status"]
    stdout: StdioCollector {
      onStreamFinished: {
        var first = text.trim().split("\n")[0]
        if (first === "pinned") root.pinned = true
        else if (first === "unpinned") root.pinned = false
      }
    }
  }

  Process {
    id: appProc
    command: [root.app, "status"]
    stdout: StdioCollector {
      onStreamFinished: {
        var line = text.trim()
        var windows = /windows=(\d+)/.exec(line)
        if (!windows) return
        root.fullscreen = /fullscreen=1/.test(line)
        root.running = Number(windows[1]) > 0 || /bridge=1/.test(line)
      }
    }
  }

  // Slow background poll; faster while the menu is open.
  Timer {
    interval: root.opened ? 2000 : 45000
    repeat: true
    running: true
    onTriggered: root.checkAll()
  }

  Timer {
    id: followUp
    property int remaining: 0
    interval: 1500
    repeat: true
    onTriggered: {
      root.checkAll()
      remaining -= 1
      if (remaining <= 0) stop()
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "\uf073"
    slotSize: Style.bar.iconSlot
    active: root.opened
    activeColor: Color.accent
    tooltipText: root.opened ? "" : (root.pinned ? "Year Planner · Pinned" : "Year Planner")
    onPressed: function(code) {
      if (code === Qt.LeftButton) root.toggle()
      else if (code === Qt.RightButton || code === Qt.MiddleButton) { root.close(); root.run("pin") }
    }
  }

  Rectangle {
    visible: root.pinned
    z: 10
    width: Style.space(6)
    height: width
    radius: width / 2
    color: Color.accent
    border.width: 1
    border.color: root.bar ? root.bar.background : "transparent"
    x: button.width / 2 + Style.space(4)
    y: button.height / 2 + Style.space(2)
  }

  YearMenu { id: menu; widget: root }
}
