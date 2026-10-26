import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// Bar button for Oma Year Planner.
// Left-click opens the planner. Right-click pins or unpins the wallpaper.
BarWidget {
  id: root
  moduleName: "io.github.karpage.oma-year"

  readonly property string pluginDir: String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "").replace(/\/$/, "")
  readonly property string launcher: pluginDir + "/year-planner/open"
  readonly property string wallpaper: pluginDir + "/year-planner/wallpaper"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function openPlanner() {
    Quickshell.execDetached([launcher])
  }

  function toggleWallpaper() {
    Quickshell.execDetached([wallpaper, "toggle"])
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "\uf073"
    slotSize: Style.bar.iconSlot
    fontSize: Style.font.caption
    tooltipText: "Oma Year Planner. Right-click or Super+Shift+Y to pin/unpin desktop"
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton) root.openPlanner()
      else if (buttonCode === Qt.RightButton) root.toggleWallpaper()
    }
  }
}
