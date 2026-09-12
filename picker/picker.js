let items = [];
let selectedIndex = 0;
let activeType = "ALL";

const TYPE_FILTERS = ["ALL", "TEXT", "URL", "CODE", "JSON", "SQL", "cURL", "EMAIL", "NOTE"];

const search = document.getElementById("search");
const container = document.getElementById("items");
const filtersEl = document.getElementById("filters");

function formatTime(date) {
  if (!date) return "";
  const d = new Date(date);
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString();
}

function getFiltered() {
  const query = search.value.toLowerCase().trim();
  return items.filter((item) => {
    const typeOk = activeType === "ALL" || item.type === activeType;
    if (!typeOk) return false;
    if (!query) return true;
    return (
      item.text.toLowerCase().includes(query) ||
      String(item.type).toLowerCase().includes(query)
    );
  });
}

function renderFilters() {
  filtersEl.innerHTML = TYPE_FILTERS.map(
    (type) => `
      <button class="chip ${activeType === type ? "active" : ""}" data-type="${type}">
        ${type === "ALL" ? "All" : type}
      </button>
    `
  ).join("");

  filtersEl.querySelectorAll(".chip").forEach((chip) => {
    chip.onclick = () => {
      activeType = chip.dataset.type;
      selectedIndex = 0;
      render();
      renderFilters();
    };
  });
}

async function loadItems() {
  items = await window.bridgePaste.getItems();
  selectedIndex = 0;
  renderFilters();
  render();
  search.focus();
  search.select();
}

function render() {
  const filtered = getFiltered();

  if (selectedIndex >= filtered.length) {
    selectedIndex = Math.max(0, filtered.length - 1);
  }

  container.innerHTML = "";

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = items.length
      ? "No matches for this search."
      : "Clipboard history is empty. Copy something to get started.";
    container.appendChild(empty);
    return;
  }

  filtered.slice(0, 120).forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "item" + (index === selectedIndex ? " selected" : "");

    const type = document.createElement("span");
    type.className = "type " + item.type;
    type.textContent = item.type;

    const wrap = document.createElement("div");
    wrap.className = "content-wrap";

    const content = document.createElement("div");
    content.className = "content";
    content.textContent = (item.preview || item.text || "").replace(/\s+/g, " ");

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = [
      formatTime(item.createdAt),
      `${(item.charCount || item.text.length)} chars`,
      item.useCount ? `used ${item.useCount}×` : null
    ]
      .filter(Boolean)
      .join(" · ");

    wrap.appendChild(content);
    wrap.appendChild(meta);

    const favorite = document.createElement("span");
    favorite.className = "favorite";
    favorite.textContent = item.favorite ? "★" : "";

    row.appendChild(type);
    row.appendChild(wrap);
    row.appendChild(favorite);

    row.onclick = () => selectItem(item);
    container.appendChild(row);
  });

  const selected = container.querySelector(".item.selected");
  if (selected) {
    selected.scrollIntoView({ block: "nearest" });
  }
}

async function selectItem(item) {
  await window.bridgePaste.copyItem(item.id);
  await window.bridgePaste.hidePicker();
}

async function favoriteSelected() {
  const filtered = getFiltered();
  const item = filtered[selectedIndex];
  if (!item) return;
  await window.bridgePaste.favoriteItem(item.id);
  await loadItems();
}

async function deleteSelected() {
  const filtered = getFiltered();
  const item = filtered[selectedIndex];
  if (!item) return;
  await window.bridgePaste.deleteItem(item.id);
  await loadItems();
}

search.addEventListener("input", () => {
  selectedIndex = 0;
  render();
});

document.addEventListener("keydown", async (event) => {
  const filtered = getFiltered();

  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, Math.max(0, filtered.length - 1));
    render();
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    render();
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const item = filtered[selectedIndex];
    if (item) await selectItem(item);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    await window.bridgePaste.hidePicker();
    return;
  }

  if (event.key === "Delete") {
    event.preventDefault();
    await deleteSelected();
    return;
  }

  if (event.key === "Backspace" && event.ctrlKey) {
    event.preventDefault();
    await deleteSelected();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    await favoriteSelected();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
    event.preventDefault();
    await deleteSelected();
  }
});

window.bridgePaste.onRefresh(loadItems);
window.bridgePaste.onClipboardChanged(() => {
  if (document.visibilityState !== "hidden") {
    loadItems();
  }
});

loadItems();
