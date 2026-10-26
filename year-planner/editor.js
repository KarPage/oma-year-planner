/* Add and edit dialog, checklist, and images. */
function onBarDown(event) {
  if (event.button !== 0) return;
  event.stopPropagation();
  var bar = event.target.closest(".bar");
  var plan = planById(bar.dataset.id);
  if (!plan) return;
  var resize = event.target.dataset && event.target.dataset.resize;
  gesture = {
    kind: "plan",
    mode: resize || "move",
    id: plan.id,
    originStart: plan.start,
    originEnd: plan.end,
    grabDate: dateFromPoint(event.clientX, event.clientY) || plan.start,
    moved: false,
    x: event.clientX,
    y: event.clientY
  };
}

function onArmMove(event) {
  pointerXY = { x: event.clientX, y: event.clientY };
  if (!arm || gesture || dialog.open || boardDrag) return;
  var iso = dateFromPoint(event.clientX, event.clientY);
  if (!iso || iso === hoverDate) return;
  hoverDate = iso;
  paintSelection();
}

function onPointerMove(event) {
  pointerXY = { x: event.clientX, y: event.clientY };
  if (boardDrag) {
    moveBoardDrag(event);
    return;
  }
  if (rangeFloater && !rangeFloater.hidden) {
    placeElement(rangeFloater, {
      left: event.clientX + 14,
      top: event.clientY + 15,
      bottom: event.clientY + 16,
      gap: 0,
      fallbackWidth: 180,
      fallbackHeight: 28
    });
  }
  if (createDrag && !gesture) {
    var over = dateFromPoint(event.clientX, event.clientY);
    if (over && over !== createDrag.iso && Math.hypot(event.clientX - createDrag.x, event.clientY - createDrag.y) > 6) {
      createDrag.moved = true;
      arm = createDrag.iso;
      hoverDate = over;
      paintSelection();
    }
    return;
  }
  if (!gesture) return;
  var iso = dateFromPoint(event.clientX, event.clientY);
  if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6) return;
  gesture.moved = true;
  if (!iso) return;
  var plan = planById(gesture.id);
  if (!plan) return;
  var preview = previewDates(gesture, iso);
  if (!preview) return;
  gesture.preview = preview;
  paintDrop(preview.start, preview.end);
  board.querySelectorAll('.bar[data-id="' + CSS.escape(plan.id) + '"]').forEach(function (bar) {
    bar.classList.add("lifting");
  });
  var counted = Planner.rangeCountLabel(preview.start, preview.end);
  showFloater(counted);
  setStatus(gesture.mode === "move"
    ? "Move " + plan.title + " to " + counted
    : "Resize " + plan.title + " to " + counted);
}

function previewDates(g, iso) {
  if (g.mode === "start") return ordered(iso, g.originEnd);
  if (g.mode === "end") return ordered(g.originStart, iso);
  var delta = Planner.diffDays(g.grabDate, iso);
  return {
    start: Planner.addDays(g.originStart, delta),
    end: Planner.addDays(g.originEnd, delta)
  };
}

function onPointerUp(event) {
  if (boardDrag) {
    endBoardDrag();
    return;
  }
  if (createDrag && !gesture) {
    var drag = createDrag;
    createDrag = null;
    if (drag.moved) {
      suppressClick = true;
      selection = ordered(drag.iso, hoverDate || drag.iso);
      arm = null;
      hoverDate = null;
      focusDate = selection.start;
      clearPlanSelection();
      paintSelection();
      openEditor(null, { start: selection.start, end: selection.end });
    }
    return;
  }
  if (!gesture) return;
  var current = gesture;
  gesture = null;
  clearDrop();
  if (current.single && current.moved) suppressClick = true;
  if (!current.moved) {
    if (current.single) return;
    if (arm && current.grabDate) {
      commitRange(current.grabDate);
      return;
    }
    arm = null;
    hoverDate = null;
    var plan = planById(current.id);
    if (plan && selectedId === plan.id && noteShownFor === plan.id && !noteCard.hidden) {
      closeNote();
      return;
    }
    noteDismissedFor = null;
    selectedId = current.id;
    if (plan) selection = { start: plan.start, end: plan.end };
    setStatus("Drag either end to change the days. Double-click to edit the note.");
    paintSelection();
    if (plan) {
      showNote(plan, true);
      syncTools();
    }
    board.querySelectorAll(".bar").forEach(function (bar) {
      bar.classList.toggle("selected", bar.dataset.id === selectedId);
    });
    return;
  }
  var iso = dateFromPoint(event.clientX, event.clientY);
  if (!iso) {
    setStatus("Drop on a day to move the plan.");
    render();
    return;
  }
  var next = previewDates(current, iso);
  applyDates(current.id, next.start, next.end);
}

function applyDates(id, start, end) {
  var plan = planById(id);
  if (!plan) return;
  var normalized = Planner.makePlan(plan, { start: start, end: end });
  if (!normalized) {
    setStatus("That date is not a real day.");
    render();
    return;
  }
  if (normalized.start === plan.start && normalized.end === plan.end) {
    setStatus(plan.title + " stays on " + rangeLabel(plan) + ".");
    render();
    return;
  }
  var parts = Planner.parse(normalized.start);
  commitEdit(function () {
    plans = plans.map(function (item) { return item.id === id ? normalized : item; });
    selectedId = normalized.id;
    selection = { start: normalized.start, end: normalized.end };
    focusDate = normalized.start;
  }, function () {
    setStatus("Moved " + normalized.title + " to " + rangeLabel(normalized) + ".");
    if (parts) scrollToMonth(parts.y, parts.m, true);
  });
}

function clearPlanSelection() {
  selectedId = null;
  board.querySelectorAll(".bar.selected").forEach(function (bar) {
    bar.classList.remove("selected");
  });
}

function commitRange(iso) {
  var range = ordered(arm, iso);
  selection = range;
  arm = null;
  hoverDate = null;
  clearPlanSelection();
  paintSelection();
  openEditor(null, { start: range.start, end: range.end });
}

function onCellClick(event) {
  if (event && event.clientX != null) pointerXY = { x: event.clientX, y: event.clientY };
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  var cell = event.target.closest && event.target.closest(".cell[data-date]");
  if (!cell || event.target.closest(".bar")) return;
  var iso = cell.dataset.date;
  focusDate = iso;
  paintFocus();
  clearPlanSelection();
  if (arm) {
    commitRange(iso);
    return;
  }
  if (selection && selection.start === iso && selection.end === iso) {
    arm = iso;
    hoverDate = iso;
    paintSelection();
    setStatus("Click a day to add the plan, or click this day again to add just this day.");
    return;
  }
  selection = { start: iso, end: iso };
  paintSelection();
}

function renderDraftImages() {
  imageList.replaceChildren();
  draftImages.forEach(function (image, index) {
    var frame = document.createElement("div");
    frame.className = "shot";
    var img = document.createElement("img");
    img.src = image.src;
    img.alt = image.name || "Attached image";
    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remove image");
    remove.addEventListener("click", function () {
      draftImages.splice(index, 1);
      renderDraftImages();
    });
    img.addEventListener("click", function () { frame.classList.toggle("is-open"); });
    frame.append(img, remove);
    imageList.append(frame);
  });
}

function shrinkImage(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var max = 1600;
      var scale = Math.min(1, max / Math.max(img.width, img.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      var data = canvas.toDataURL("image/webp", 0.8);
      if (data.indexOf("data:image/webp") !== 0) data = canvas.toDataURL("image/jpeg", 0.8);
      if (data.length > 700000) data = canvas.toDataURL("image/jpeg", 0.6);
      resolve(data);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

function showSection(id, open) {
  var node = document.getElementById(id);
  if (node) node.hidden = !open;
}

function updateDayCount() {
  if (endInput.value && startInput.value && endInput.value < startInput.value) endInput.value = startInput.value;
  var days = 1;
  if (spanMode === "trip" && startInput.value && endInput.value && endInput.value >= startInput.value) {
    days = Planner.diffDays(startInput.value, endInput.value) + 1;
  }
  var node = document.getElementById("day-count");
  if (node) node.textContent = "· " + Planner.plural(days, "day");
}

function setSpanMode(mode) {
  spanMode = mode === "single" ? "single" : "trip";
  document.getElementById("span-single").setAttribute("aria-pressed", spanMode === "single" ? "true" : "false");
  document.getElementById("span-trip").setAttribute("aria-pressed", spanMode === "trip" ? "true" : "false");
  document.getElementById("end-field").hidden = spanMode === "single";
  var startLabel = document.getElementById("start-label");
  if (startLabel) startLabel.textContent = spanMode === "single" ? "Date" : "Starts";
  if (spanMode === "single") endInput.value = startInput.value;
  updateDayCount();
}

function setDraftType(type) {
  draftType = type === "Event" || type === "Reminder" ? type : "Trip";
  document.querySelectorAll(".type-btn").forEach(function (button) {
    button.setAttribute("aria-pressed", button.dataset.type === draftType ? "true" : "false");
  });
}

function paintEditorSwatches() {
  var row = document.getElementById("f-swatches");
  if (!row) return;
  row.replaceChildren();
  ["--travel", "--work", "--personal", "--other", "--accent", "--range"].forEach(function (name) {
    var hex = themeSwatch(name);
    if (!hex) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.style.background = "var(" + name + ")";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-label", name.slice(2));
    button.setAttribute("aria-checked", colorInput.value.toLowerCase() === hex ? "true" : "false");
    button.setAttribute("aria-pressed", colorInput.value.toLowerCase() === hex ? "true" : "false");
    button.addEventListener("click", function () {
      colorInput.value = hex;
      paintEditorSwatches();
    });
    row.append(button);
  });
  var custom = document.createElement("button");
  custom.type = "button";
  custom.className = "swatch custom";
  custom.textContent = "+";
  custom.setAttribute("aria-label", "Custom color");
  custom.addEventListener("click", function () { colorInput.click(); });
  row.append(custom);
}

function renderChecks() {
  var list = document.getElementById("check-list");
  if (!list) return;
  list.replaceChildren();
  draftChecks.forEach(function (item, index) {
    var li = document.createElement("li");
    li.className = "check-item";
    li.draggable = true;
    var box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!item.done;
    box.addEventListener("change", function () { item.done = box.checked; });
    var field = document.createElement("input");
    field.type = "text";
    field.value = item.text;
    field.maxLength = 200;
    field.setAttribute("aria-label", "Checklist item");
    field.addEventListener("input", function () { item.text = field.value; });
    field.addEventListener("keydown", function (event) {
      if (event.key === "Backspace" && !field.value) {
        event.preventDefault();
        draftChecks.splice(index, 1);
        renderChecks();
      }
    });
    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remove item");
    remove.addEventListener("click", function () {
      draftChecks.splice(index, 1);
      renderChecks();
    });
    li.addEventListener("dragstart", function (event) {
      event.dataTransfer.setData("text/plain", String(index));
    });
    li.addEventListener("dragover", function (event) { event.preventDefault(); });
    li.addEventListener("drop", function (event) {
      event.preventDefault();
      var from = +event.dataTransfer.getData("text/plain");
      if (isNaN(from) || from === index) return;
      var moved = draftChecks.splice(from, 1)[0];
      draftChecks.splice(index, 0, moved);
      renderChecks();
    });
    li.append(box, field, remove);
    list.append(li);
  });
}

function openEditor(plan, defaults, focusNote) {
  closeDayList();
  hideFloater();
  editingId = plan ? plan.id : null;
  formError.textContent = "";
  titleInput.value = plan ? plan.title : "";
  colorInput.value = plan && plan.color ? plan.color : (themeSwatch("--travel") || "#74a869");
  var start = plan ? plan.start : (defaults && defaults.start) || cellDate(year, todayParts().m, todayParts().d);
  var end = plan ? plan.end : (defaults && defaults.end) || start;
  if (!plan && defaults && defaults.single) end = start;
  if (end < start) end = start;
  startInput.value = start;
  endInput.value = end;
  setSpanMode(start === end ? "single" : "trip");
  setDraftType(plan && plan.type ? plan.type : (start === end ? "Event" : "Trip"));
  noteInput.value = plan && plan.note ? plan.note : "";
  draftChecks = plan && plan.checklist ? plan.checklist.map(function (item) {
    return { id: item.id || "", text: item.text, done: !!item.done };
  }) : [];
  draftImages = plan && plan.images ? plan.images.map(function (image) {
    return { name: image.name, src: image.src };
  }) : [];
  showSection("sec-note", !!noteInput.value);
  showSection("sec-check", draftChecks.length > 0);
  showSection("sec-image", draftImages.length > 0);
  renderChecks();
  renderDraftImages();
  paintEditorSwatches();
  deleteBtn.hidden = !plan;
  document.getElementById("editor-title").textContent = plan ? "Edit plan" : "Add plan";
  dialog.classList.remove("anchored");
  dialog.style.left = "";
  dialog.style.top = "";
  dialog.showModal();
  if (focusNote && plan && !document.getElementById("sec-note").hidden) {
    noteInput.focus();
  } else {
    titleInput.focus();
    titleInput.select();
  }
}

function closeEditor() {
  if (dialog.open) dialog.close();
}

function activeRange() {
  if (arm) return ordered(arm, hoverDate || arm);
  return selection;
}

function addFromSelection(singleDay) {
  var today = todayParts();
  var range = activeRange();
  var start = range ? range.start : (today.y === year ? cellDate(year, today.m, today.d) : cellDate(year, 1, 1));
  var end = range && !singleDay ? range.end : start;
  openEditor(null, { start: start, end: end, single: singleDay });
}

document.getElementById("f-attach").addEventListener("click", function () {
  imageInput.click();
});
document.getElementById("span-single").addEventListener("click", function () { setSpanMode("single"); });
document.getElementById("span-trip").addEventListener("click", function () { setSpanMode("trip"); });
document.querySelectorAll(".type-btn").forEach(function (button) {
  button.addEventListener("click", function () { setDraftType(button.dataset.type); });
});
startInput.addEventListener("change", updateDayCount);
endInput.addEventListener("change", updateDayCount);
colorInput.addEventListener("input", paintEditorSwatches);
titleInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    form.requestSubmit();
  }
});
dialog.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});
document.getElementById("add-note").addEventListener("click", function () { showSection("sec-note", true); noteInput.focus(); });
document.getElementById("add-check").addEventListener("click", function () { showSection("sec-check", true); document.getElementById("check-add").focus(); });
document.getElementById("add-image").addEventListener("click", function () { showSection("sec-image", true); });
document.getElementById("check-add").addEventListener("keydown", function (event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  var text = event.target.value.trim();
  if (!text) return;
  draftChecks.push({ id: String(Date.now()) + draftChecks.length, text: text, done: false });
  event.target.value = "";
  renderChecks();
});
function takeImageFile(file) {
  if (!file) return;
  showSection("sec-image", true);
  if (draftImages.length >= 4) {
    formError.textContent = "A plan can keep four images.";
    return;
  }
  if (!/^image\//.test(file.type)) {
    formError.textContent = "Choose an image file.";
    return;
  }
  shrinkImage(file).then(function (src) {
    if (src.length > 900000) {
      formError.textContent = "That image is too large to keep with the plan.";
      return;
    }
    draftImages.push({ name: file.name || "image", src: src });
    formError.textContent = "";
    renderDraftImages();
  }).catch(function () {
    formError.textContent = "Couldn't read that image.";
  });
}
dialog.addEventListener("dragover", function (event) { event.preventDefault(); });
dialog.addEventListener("drop", function (event) {
  event.preventDefault();
  var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  takeImageFile(file);
});
dialog.addEventListener("paste", function (event) {
  var items = event.clipboardData && event.clipboardData.items;
  if (!items) return;
  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image/") === 0) {
      event.preventDefault();
      takeImageFile(items[i].getAsFile());
      return;
    }
  }
});

imageInput.addEventListener("change", function () {
  var file = imageInput.files && imageInput.files[0];
  imageInput.value = "";
  takeImageFile(file);
});

form.addEventListener("submit", function (event) {
  event.preventDefault();
  if (spanMode === "single") endInput.value = startInput.value;
  if (endInput.value && endInput.value < startInput.value) endInput.value = startInput.value;
  var normalized = Planner.makePlan(null, {
    id: editingId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    title: titleInput.value,
    type: draftType,
    color: colorInput.value,
    note: document.getElementById("sec-note").hidden ? "" : noteInput.value,
    checklist: document.getElementById("sec-check").hidden ? [] : draftChecks,
    images: draftImages,
    start: startInput.value,
    end: endInput.value
  });
  if (!normalized) {
    formError.textContent = "Give the plan a name and a real start and end date.";
    return;
  }
  var wasEditing = !!editingId;
  var id = editingId;
  commitEdit(function () {
    if (id) {
      plans = plans.map(function (plan) {
        return plan.id === id ? normalized : plan;
      });
    } else {
      plans = plans.concat([normalized]);
    }
    selectedId = normalized.id;
    selection = { start: normalized.start, end: normalized.end };
    focusDate = normalized.start;
    arm = null;
    hoverDate = null;
    noteDismissedFor = null;
  }, function () {
    closeEditor();
    setStatus((wasEditing ? "Updated " : "Added ") + normalized.title + ".");
    var parts = Planner.parse(normalized.start);
    if (parts) scrollToMonth(parts.y, parts.m, true);
  });
});

function deletePlan(id) {
  var plan = planById(id);
  if (!plan) return;
  commitEdit(function () {
    plans = plans.filter(function (item) { return item.id !== id; });
    if (selectedId === id) selectedId = null;
  }, function () {
    setStatus("Deleted " + plan.title + ".");
  });
}

deleteBtn.addEventListener("click", function () {
  if (!editingId) return;
  var id = editingId;
  closeEditor();
  deletePlan(id);
});

document.getElementById("f-cancel").addEventListener("click", closeEditor);

startInput.addEventListener("change", function () {
  if (endInput.value && endInput.value < startInput.value) endInput.value = startInput.value;
});

actionAdd.addEventListener("click", function () {
  addFromSelection(!!selectedId);
});
actionEdit.addEventListener("click", function () {
  var plan = planById(selectedId);
  if (plan) openEditor(plan);
});
actionOpen.addEventListener("click", function () {
  var plan = planById(selectedId);
  if (!plan) return;
  if (noteShownFor === plan.id && !noteCard.hidden) {
    closeNote();
    return;
  }
  noteDismissedFor = null;
  showNote(plan, true);
});
actionDelete.addEventListener("click", function () {
  if (selectedId) deletePlan(selectedId);
});

document.getElementById("prev").addEventListener("click", function () {
  scrollToMonth(Math.max(RANGE_START, year - 1), 1, true);
});
document.getElementById("next").addEventListener("click", function () {
  scrollToMonth(Math.min(RANGE_END, year + 1), 1, true);
});
document.getElementById("today-title").addEventListener("click", function () {
  document.getElementById("today").click();
});

document.getElementById("today").addEventListener("click", function () {
  var today = todayParts();
  focusDate = cellDate(today.y, today.m, today.d);
  selection = { start: focusDate, end: focusDate };
  arm = null;
  hoverDate = null;
  selectedId = null;
  paintSelection();
  paintFocus();
  scrollToMonth(today.y, today.m, true);
});

var rollingBtn = document.getElementById("rolling");
var rolling = sessionStorage.getItem("year-planner/rolling") === "1";