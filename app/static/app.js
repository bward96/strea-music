// ========== UI: Hamburger & Dropdown ==========

function toggleHamburgerMenu() {
  const wrapper = document.querySelector('.hamburger-menu-wrapper');
  if (wrapper) {
    wrapper.classList.toggle('show-dropdown');
  }
}

// Optional: close dropdown when clicking outside
document.addEventListener('click', function(e) {
  const wrapper = document.querySelector('.hamburger-menu-wrapper');
  if (!wrapper) return;
  if (!wrapper.contains(e.target)) {
    wrapper.classList.remove('show-dropdown');
  }
});

document.addEventListener("DOMContentLoaded", function() {
  const toggleQueueBtn = document.getElementById("toggleQueue");
  const queueContainer = document.getElementById("queue-container");
  const mainElem = document.querySelector("main");
  if (toggleQueueBtn && queueContainer) {
    toggleQueueBtn.addEventListener("click", function() {
      queueContainer.classList.toggle("active");
      if (mainElem) {
        mainElem.classList.toggle(
          "queue-active",
          queueContainer.classList.contains("active")
        );
      }
    });
    queueContainer.addEventListener("click", function(e) {
      e.stopPropagation();
    });
  }
});
document.addEventListener("click", function(e) {
  const queue = document.getElementById("queue-container");
  const btn = document.getElementById("toggleQueue");
  const mainElem = document.querySelector("main");
  if (!queue || !btn) return;
  if (
    !queue.contains(e.target) &&
    !btn.contains(e.target) &&
    queue.classList.contains("active")
  ) {
    queue.classList.remove("active");
    if (mainElem) mainElem.classList.remove("queue-active");
  }
});



// ========== Search with Clear Button ==========

let originalFileListHTML = "";
function clearSearch() {
  const searchInput = document.getElementById("searchInput");
  searchInput.value = "";
  document.querySelector(".clear-icon").style.display = "none";
  document.getElementById("fileListContainer").innerHTML = originalFileListHTML;
  initLazyLoading();
  updateGlobalFileList();
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  }
}

// ========== Player State ==========

var songQueue = [];
var currentIndex = 0;
var shuffleOn = false;
var repeatMode = "none";
var fileList = [];
var metadataCache = {};
var currentMetadataController = null;

// ========== Search Bar Events ==========

document.addEventListener("DOMContentLoaded", () => {
  // Save the original list on load
  originalFileListHTML = document.getElementById("fileListContainer").innerHTML;

  // Clear icon show/hide
  const searchInput = document.getElementById("searchInput");
  const clearIcon = document.querySelector(".clear-icon");
  if (searchInput && clearIcon) {
    searchInput.addEventListener("input", () => {
      clearIcon.style.display = searchInput.value ? "block" : "none";
    });
    searchInput.addEventListener("input", debounce(function (e) {
      doSearch(e.target.value);
    }, 300));
  }

  // Volume bar CSS
  updateVolCSS();
  loadPlayerState();
  updateGlobalFileList();
  initLazyLoading();
});

// ========== Folder Navigation ==========

function checkAuthResponse(response) {
  if (response.status === 401) {
    window.location.href = "/";
    throw new Error("InvalidAuthenticationToken");
  }
  return response;
}

function fetchFolder(folderId) {
  fetch(`/get_files?folder_id=${encodeURIComponent(folderId)}`)
    .then(checkAuthResponse)
    .then(response => response.text())
    .then(html => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const newFileList = doc.getElementById("fileListContainer").innerHTML;
      const container = document.getElementById("fileListContainer");
      container.innerHTML = newFileList;
      originalFileListHTML = newFileList;
      initLazyLoading();
      updateGlobalFileList();
    })
    .catch(err => console.error("Error loading folder:", err));
}

function navigateToFolder(folderId) {
  fetchFolder(folderId);
  history.pushState({ folder_id: folderId }, "", `/get_files?folder_id=${encodeURIComponent(folderId)}`);
}
function goBack() {
  history.back();
}
window.addEventListener("popstate", (event) => {
  const state = event.state;
  const folderId = (state && state.folder_id) ? state.folder_id : "root";
  fetchFolder(folderId);
});

// ========== File List Search ==========

function doSearch(query) {
  const container = document.getElementById("fileListContainer");
  query = query.trim().toLowerCase();
  if (!query) {
    container.innerHTML = originalFileListHTML;
    initLazyLoading();
    updateGlobalFileList();
    return;
  }
  // Filter the files
  const tempContainer = document.createElement("div");
  tempContainer.innerHTML = originalFileListHTML;
  const filteredItems = Array.from(tempContainer.querySelectorAll("li")).filter(li => {
    if (li.classList.contains("back-btn")) return true;
    const titleElem = li.querySelector(".file-title");
    const artistAlbumElem = li.querySelector(".artist-album");
    const text = [(titleElem ? titleElem.innerText : ''), (artistAlbumElem ? artistAlbumElem.innerText : '')].join(' ').toLowerCase();
    return text.includes(query);
  });
  container.innerHTML = filteredItems.map(li => li.outerHTML).join("");
  initLazyLoading();
  updateGlobalFileList();
}

// ========== Queue ==========

function addToQueue(fileId, fileName) {
  fileName = fileName.replace(/&#39;/g, "'");
  songQueue.push({ fileId, fileName });
  updateQueueUI();
  savePlayerState();
}

function removeFromQueue(index) {
  songQueue.splice(index, 1);
  if (index < currentIndex) currentIndex--;
  updateQueueUI();
  savePlayerState();
}

function clearQueue() {
  if (confirm("Are you sure you want to clear all songs from the queue?")) {
    songQueue = [];
    currentIndex = 0;
    updateQueueUI();
    savePlayerState();
  }
}

function trimQueue() {
  if (currentIndex > 3) {
    const removeCount = currentIndex - 3;
    songQueue.splice(0, removeCount);
    currentIndex -= removeCount;
  }
}

function updateQueueUI() {
  const queueList = document.getElementById("queue-list");
  if (!queueList) return;
  queueList.innerHTML = "";
  songQueue.forEach((song, idx) => {
    const listItem = document.createElement("li");
     listItem.setAttribute("draggable", "true");
	 listItem.dataset.index = idx;
	 listItem.className = idx === currentIndex ? "queue-song active" : "queue-song";
	 listItem.innerHTML = `<span class="queue-title">${song.fileName}</span>
    <button class="btn remove-btn" onclick="removeFromQueue(${idx})"><span>&times;</span></button>`;
    if (idx === currentIndex) listItem.classList.add("active");
    listItem.addEventListener("dragstart", handleDragStart, false);
    listItem.addEventListener("dragover", handleDragOver, false);
    listItem.addEventListener("dragenter", handleDragEnter, false);
    listItem.addEventListener("dragleave", handleDragLeave, false);
    listItem.addEventListener("drop", handleDrop, false);
    listItem.addEventListener("dragend", handleDragEnd, false);
    queueList.appendChild(listItem);
  });
}

// ========== Player Controls & Metadata ==========

function formatDuration(duration) {
  if (!duration) return "Unknown";
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function savePlayerState() {
  const state = { queue: songQueue, currentIndex: currentIndex, shuffle: shuffleOn, repeat: repeatMode };
  localStorage.setItem("musicPlayerState", JSON.stringify(state));
}
function loadPlayerState() {
  const stateStr = localStorage.getItem("musicPlayerState");
  if (stateStr) {
    try {
      const state = JSON.parse(stateStr);
      songQueue = state.queue || [];
      currentIndex = state.currentIndex || 0;
      shuffleOn = state.shuffle || false;
      repeatMode = state.repeat || "none";
      document.getElementById("shuffleBtn").classList.toggle("active", shuffleOn);
      const repeatBtn = document.getElementById("repeatBtn");
      if (repeatMode === "none") {
        repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
        repeatBtn.classList.remove("active");
      } else if (repeatMode === "one") {
        repeatBtn.innerHTML = '<i class="fas fa-redo-alt"></i>';
        repeatBtn.classList.add("active");
      } else if (repeatMode === "all") {
        repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
        repeatBtn.classList.add("active");
      }
    } catch (e) {
      console.error("Error parsing saved player state", e);
    }
  }
}

function selectFile(fileId, fileName) {
  fileName = fileName.replace(/&#39;/g, "'");
  if (songQueue.length > 0) {
    songQueue[currentIndex] = { fileId, fileName };
  } else {
    songQueue = [{ fileId, fileName }];
    currentIndex = 0;
  }
  updateQueueUI();
  playCurrentSong();
  savePlayerState();
}

function showMetadata(fileId, signal) {
  const encodedFileId = encodeURIComponent(fileId);
  fetch(`/metadata/${encodedFileId}`, { signal })
    .then(checkAuthResponse)
    .then(response => response.json())
    .then(data => {
      if (data.error && data.error === "InvalidAuthenticationToken") {
        window.location.href = "/";
        return;
      }
      document.getElementById("metadata-album").innerText = `Album: ${data.album || "Unknown"}`;
      const durationText = data.duration ? formatDuration(data.duration) : "Unknown";
      document.getElementById("metadata-duration").innerText = `Duration: ${durationText}`;
      const albumArtwork = document.getElementById("album-artwork");
      albumArtwork.src = (data.album_art && data.album_art.trim() !== "") ? data.album_art : "";
    })
    .catch(err => {
      if (err.name === "AbortError") {
        console.log("Metadata fetch aborted for " + fileId);
      } else {
        console.error("Metadata fetch error:", err);
      }
    });
}

function playCurrentSong() {
  trimQueue();
  if (currentIndex >= songQueue.length) {
    loadNextFromFileList();
    return;
  }
  const song = songQueue[currentIndex];
  const fileUrl = `/stream/${song.fileId}`;
  const audio = document.getElementById("audio-player");
  const source = document.getElementById("audio-source");
  const nowPlaying = document.getElementById("now-playing");

  source.src = fileUrl;
  audio.load();
  audio.play().then(() => {
    audio.controls = false;
    setTimeout(() => { audio.controls = true; }, 50);
	updatePlayPauseIcon(true); // This sets the button to pause
  }).catch(err => console.error("Playback error:", err));
  nowPlaying.innerText = song.fileName;
  document.title = song.fileName + " - StreaMusic";
  updateQueueUI();

  if (currentMetadataController) {
    currentMetadataController.abort();
  }
  currentMetadataController = new AbortController();
  if (window.requestIdleCallback) {
    requestIdleCallback(() => {
      showMetadata(song.fileId, currentMetadataController.signal);
    });
  } else {
    setTimeout(() => {
      showMetadata(song.fileId, currentMetadataController.signal);
    }, 500);
  }
  savePlayerState();
}

// Ended event for next song/repeat/shuffle
document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("audio-player").addEventListener("ended", () => {
    if (repeatMode === "one") {
      playCurrentSong();
    } else if (currentIndex < songQueue.length - 1) {
      currentIndex++;
      playCurrentSong();
    } else if (shuffleOn && fileList.length > 0) {
      let randIndex;
      do {
        randIndex = Math.floor(Math.random() * fileList.length);
      } while (songQueue[currentIndex] && fileList[randIndex].fileId === songQueue[currentIndex].fileId && fileList.length > 1);
      songQueue.push({ fileId: fileList[randIndex].fileId, fileName: fileList[randIndex].fileName });
      currentIndex = songQueue.length - 1;
      playCurrentSong();
    } else if (repeatMode === "all" && songQueue.length > 0) {
      currentIndex = 0;
      playCurrentSong();
    } else {
      loadNextFromFileList();
    }
    savePlayerState();
  });
});

// ========== Player Controls (Next/Prev/Shuffle/Repeat) ==========

window.nextSong = function () {
  if (repeatMode === "one") {
    playCurrentSong();
    return;
  }

  if (shuffleOn) {
    let randIndex;
    if (fileList.length === 0) return;
    do {
      randIndex = Math.floor(Math.random() * fileList.length);
    } while (songQueue[currentIndex] && fileList[randIndex].fileId === songQueue[currentIndex].fileId && fileList.length > 1);
    songQueue.push({ fileId: fileList[randIndex].fileId, fileName: fileList[randIndex].fileName });
    currentIndex = songQueue.length - 1;
  } else {
    if (currentIndex < songQueue.length - 1) {
      currentIndex++;
    } else {
      loadNextFromFileList();
      return;
    }
  }

  playCurrentSong();
  savePlayerState();
};
function previousSong() {
  if (songQueue.length === 0) return;
  if (repeatMode === "one") {
    playCurrentSong();
  } else if (currentIndex > 0) {
    currentIndex--;
  } else {
    currentIndex = songQueue.length - 1;
  }
  playCurrentSong();
  savePlayerState();
}
function toggleShuffle() {
  shuffleOn = !shuffleOn;
  document.getElementById("shuffleBtn").classList.toggle("active", shuffleOn);
  savePlayerState();
}
function toggleRepeat() {
  const repeatBtn = document.getElementById("repeatBtn");
  if (repeatMode === "none") {
    repeatMode = "one";
    repeatBtn.innerHTML = '<i class="fas fa-redo-alt"></i>';
  } else if (repeatMode === "one") {
    repeatMode = "all";
    repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
  } else {
    repeatMode = "none";
    repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
  }
  repeatBtn.classList.toggle("active", repeatMode !== "none");
  savePlayerState();
}
function updatePlayPauseIcon(isPlaying) {
  const playPauseBtn = document.getElementById("playPauseBtn");
  if (playPauseBtn) {
    playPauseBtn.innerHTML = isPlaying
      ? '<i class="fas fa-pause"></i>'
      : '<i class="fas fa-play"></i>';
  }
}
window.togglePlayPause = function () {
  var audio = document.getElementById("audio-player");
  if (!audio.currentSrc || !audio.currentSrc.trim()) {
    console.warn("No song loaded.");
    return;
  }
  if (audio.paused) {
    audio.play().catch(err => console.error("Play error:", err));
    updatePlayPauseIcon(true);
  } else {
    audio.pause();
    updatePlayPauseIcon(false);
  }
};

// ========== Seekbar & Volume ==========

function updateVolCSS() {
  const volumeSlider = document.getElementById('volume-slider');
  if (volumeSlider) {
    const pct = volumeSlider.value + '%';
    volumeSlider.style.setProperty('--volplayed', pct);
  }
}
document.addEventListener("DOMContentLoaded", function () {
  const progressBar = document.getElementById("progress-bar");
  const audio = document.getElementById("audio-player");
  const currentTimeDisplay = document.getElementById("current-time");
  const durationDisplay = document.getElementById("duration");
  const volumeSlider = document.getElementById("volume-slider");

  // ----- 2b. Update Play/Pause Icon on audio state -----
  function updatePlayPauseIcon(isPlaying) {
    const playPauseBtn = document.getElementById("playPauseBtn");
    if (playPauseBtn) {
      playPauseBtn.innerHTML = isPlaying
        ? '<i class="fas fa-pause"></i>'
        : '<i class="fas fa-play"></i>';
    }
  }
  if (audio) {
    audio.addEventListener('play', function() {
      updatePlayPauseIcon(true);
    });
    audio.addEventListener('pause', function() {
      updatePlayPauseIcon(false);
    });
    // Set correct icon on page load
    updatePlayPauseIcon(!audio.paused);
  }
  // -----------------------------------------------------

  if (progressBar && audio) {
    progressBar.max = Math.floor(audio.duration) || 0;

    progressBar.addEventListener("input", function () {
      audio.currentTime = this.value;
      const pct = (this.value / this.max) * 100;
      this.style.setProperty("--played", pct + "%");
    });

    audio.addEventListener("timeupdate", () => {
      progressBar.value = Math.floor(audio.currentTime);
      progressBar.style.setProperty("--played", ((audio.currentTime / audio.duration) * 100) + "%");
      if (currentTimeDisplay) currentTimeDisplay.textContent = formatDuration(audio.currentTime);
    });

    audio.addEventListener("loadedmetadata", function () {
      progressBar.max = Math.floor(audio.duration);
      if (durationDisplay) durationDisplay.textContent = formatDuration(audio.duration);
      progressBar.style.setProperty("--played", "0%");
    });
  }
  if (volumeSlider && audio) {
    volumeSlider.addEventListener('input', () => {
      audio.volume = volumeSlider.value / 100;
      updateVolCSS();
    });
    audio.addEventListener('volumechange', () => {
      volumeSlider.value = Math.round(audio.volume * 100);
      updateVolCSS();
    });
    // Load from localStorage if available
    const savedVolume = localStorage.getItem("volume");
    if (savedVolume !== null) {
      audio.volume = savedVolume;
      volumeSlider.value = Math.round(savedVolume * 100);
      updateVolCSS();
    }
    volumeSlider.addEventListener("change", function () {
      localStorage.setItem("volume", audio.volume);
    });
  }
});

// ========== Lazy Loading Album Art ==========

function updateItemMetadata(itemElem, data) {
  if (!itemElem) return;
  const titleElem = itemElem.querySelector('.file-title');
  const artistAlbumElem = itemElem.querySelector('.artist-album');
  if (titleElem && data.title && data.title.trim() !== '') {
    titleElem.textContent = data.title;
  }
  if (artistAlbumElem) {
    const parts = [];
    if (data.artist && data.artist.trim() !== '') parts.push(data.artist);
    if (data.album && data.album.trim() !== '') parts.push(data.album);
    artistAlbumElem.textContent = parts.join(' - ');
  }
}

function initLazyLoading() {
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const imgElem = entry.target;
          const fileId = imgElem.getAttribute("data-fileid");
          const itemElem = imgElem.closest('.file-item');
          if (metadataCache[fileId]) {
            if (metadataCache[fileId].album_art && metadataCache[fileId].album_art.trim() !== "") {
              imgElem.src = metadataCache[fileId].album_art;
            }
            updateItemMetadata(itemElem, metadataCache[fileId]);
            obs.unobserve(imgElem);
          } else {
            const encodedFileId = encodeURIComponent(fileId);
            fetch(`/metadata/${encodedFileId}`)
              .then(checkAuthResponse)
              .then(response => response.json())
              .then(data => {
                if (data.error && data.error === "InvalidAuthenticationToken") {
                  window.location.href = "/";
                  return;
                }
                if (data.album_art && data.album_art.trim() !== "") {
                  imgElem.src = data.album_art;
                }
                metadataCache[fileId] = data;
                updateItemMetadata(itemElem, data);
                obs.unobserve(imgElem);
              })
              .catch(err => console.error("Error fetching album art for", fileId, err));
          }
        }
      });
    }, { rootMargin: "100px" });
    const thumbnails = document.querySelectorAll(".file-thumbnail");
    thumbnails.forEach(imgElem => observer.observe(imgElem));
  } else {
    const thumbnails = document.querySelectorAll(".file-thumbnail");
    thumbnails.forEach(function (imgElem) {
      const fileId = imgElem.getAttribute("data-fileid");
      const itemElem = imgElem.closest('.file-item');
      if (metadataCache[fileId]) {
        if (metadataCache[fileId].album_art && metadataCache[fileId].album_art.trim() !== "") {
          imgElem.src = metadataCache[fileId].album_art;
        }
        updateItemMetadata(itemElem, metadataCache[fileId]);
      } else {
        const encodedFileId = encodeURIComponent(fileId);
        fetch(`/metadata/${encodedFileId}`)
          .then(checkAuthResponse)
          .then(response => response.json())
          .then(data => {
            if (data.error && data.error === "InvalidAuthenticationToken") {
              window.location.href = "/";
              return;
            }
            if (data.album_art && data.album_art.trim() !== "") {
              imgElem.src = data.album_art;
            }
            metadataCache[fileId] = data;
            updateItemMetadata(itemElem, data);
          })
          .catch(err => console.error("Error fetching album art for", fileId, err));
      }
    });
  }
}

// ========== Global File List for Shuffle ==========

function updateGlobalFileList() {
  const items = document.querySelectorAll(".file-item");
  fileList = Array.from(items).map(item => {
    const fileId = item.querySelector(".file-thumbnail").getAttribute("data-fileid");
    const fileName = item.querySelector(".file-title").innerText;
    return { fileId, fileName };
  });
}

function loadNextFromFileList() {
  if (fileList.length === 0) return;
  let nextIndex = 0;
  if (songQueue[currentIndex]) {
    const currId = songQueue[currentIndex].fileId;
    const idx = fileList.findIndex(item => item.fileId === currId);
    if (idx >= 0 && idx < fileList.length - 1) {
      nextIndex = idx + 1;
    } else if (idx === -1) {
      nextIndex = 0;
    } else {
      return; // reached end of list with no repeat
    }
  }
  const next = fileList[nextIndex];
  songQueue.push({ fileId: next.fileId, fileName: next.fileName });
  currentIndex = songQueue.length - 1;
  playCurrentSong();
  savePlayerState();
}

// ========== Drag-and-Drop for Queue Reordering ==========

let dragSrcEl = null;
function handleDragStart(e) {
  dragSrcEl = this;
  this.style.opacity = "0.5";
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", this.dataset.index);
}
function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  return false;
}
function handleDragEnter(e) { this.classList.add("drag-over"); }
function handleDragLeave(e) { this.classList.remove("drag-over"); }
function handleDrop(e) {
  if (e.stopPropagation) e.stopPropagation();
  const srcIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
  const destIndex = parseInt(this.dataset.index, 10);
  if (srcIndex !== destIndex) {
    const movedItem = songQueue.splice(srcIndex, 1)[0];
    songQueue.splice(destIndex, 0, movedItem);
    if (srcIndex === currentIndex) currentIndex = destIndex;
    else if (srcIndex < currentIndex && destIndex >= currentIndex) currentIndex--;
    else if (srcIndex > currentIndex && destIndex <= currentIndex) currentIndex++;
  }
  updateQueueUI();
  savePlayerState();
  return false;
}
function handleDragEnd(e) {
  this.style.opacity = "1";
  const items = document.querySelectorAll("#queue-list li");
  items.forEach((item) => { item.classList.remove("drag-over"); });
}

// ========== Lyrics Button ==========

function openLyrics() {
  const nowPlaying = document.getElementById("now-playing").innerText;
  if (!nowPlaying) return;
  const searchQuery = encodeURIComponent(nowPlaying.trim());
  const geniusURL = `https://genius.com/search?q=${searchQuery}`;
  window.open(geniusURL, '_blank');
}

// ========== Main: Shortcuts ==========

document.addEventListener('keydown', function(e) {
  const audio = document.getElementById("audio-player");
  const key = e.key === ' ' ? 'Space' : (e.code || e.key);
  switch (key) {
    case 'Space':
      e.preventDefault();
      togglePlayPause();
      break;
    case 'ArrowRight':
    case 'Right':
      audio.currentTime = Math.min(audio.currentTime + 5, audio.duration);
      break;
    case 'ArrowLeft':
    case 'Left':
      audio.currentTime = Math.max(audio.currentTime - 5, 0);
      break;
    case 'ArrowUp':
      e.preventDefault();
      audio.volume = Math.min(audio.volume + 0.1, 1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      audio.volume = Math.max(audio.volume - 0.1, 0);
      break;
    default:
      return;
  }
});
