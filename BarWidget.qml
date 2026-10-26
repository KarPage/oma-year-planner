import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// Bar button for Oma Year Planner. Click opens the planner window.
BarWidget {
  id: root
  moduleName: "io.github.karpage.oma-year"

  readonly property string pluginDir: String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "").replace(/\/$/, "")
  readonly property string launcher: pluginDir + "/year-planner/open"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function openPlanner() {
    Quickshell.execDetached([launcher])
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "\uf073"
    slotSize: Style.bar.iconSlot
    fontSize: Style.font.caption
    tooltipText: "Oma Year Planner"
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton) root.openPlanner()
    }
  }
}
