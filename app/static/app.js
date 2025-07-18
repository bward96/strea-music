// ========== State & Caches ==========
let songQueue = [];
let currentIndex = 0;
let shuffleOn = false;
let shuffleDeck = []; // The deck of unplayed songs for shuffle mode
let repeatMode = "none"; // 'none', 'one', 'all'
let fileList = []; // A flat list of all playable files currently visible
let metadataCache = {};
let currentMetadataController = null;
let originalFileListHTML = ""; // Cache for the currently viewed folder list

// --- New state for background metadata loading ---
let backgroundMetadataQueue = [];
let isQueuePaused = false;
let metadataLoadGeneration = 0; // Tracks the current loading process generation


// ========== Initialization ==========
document.addEventListener("DOMContentLoaded", () => {
  // Store the initial HTML of the file list to enable search resets
  const fileListContainer = document.getElementById("fileListContainer");
  if (fileListContainer) {
    originalFileListHTML = fileListContainer.innerHTML;
  }

  initEventListeners();
  setupMediaSession();
  updateGlobalFileList();
  loadPlayerState();
  applyCachedMetadata();
  startBackgroundMetadataLoad();
  updateVolCSS();
});

// ========== Event Listeners Setup ==========
function initEventListeners() {
  const searchInput = document.getElementById("searchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  const hamburgerMenu = document.getElementById("hamburger-menu");
  const toggleQueueBtn = document.getElementById("toggleQueue");
  const fileListContainer = document.getElementById("fileListContainer");
  const queueList = document.getElementById("queue-list");
  const clearQueueBtn = document.getElementById("clearQueue");
  const audioPlayer = document.getElementById("audio-player");
  const progressBar = document.getElementById("progress-bar");
  const volumeSlider = document.getElementById("volume-slider");

  // --- Search Bar ---
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      if (clearSearchBtn) {
        clearSearchBtn.style.display = searchInput.value ? "block" : "none";
      }
    });
    searchInput.addEventListener("input", debounce(e => doSearch(e.target.value), 300));
  }
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", clearSearch);
  }

  // --- Hamburger & Queue Menus ---
  if (hamburgerMenu) {
    hamburgerMenu.addEventListener("click", toggleHamburgerMenu);
  }
  if (toggleQueueBtn) {
    toggleQueueBtn.addEventListener("click", toggleQueueVisibility);
  }

  // --- Global Click Listener (for closing menus) ---
  document.addEventListener("click", handleGlobalClick);

  // --- Event Delegation for File List ---
  if (fileListContainer) {
    fileListContainer.addEventListener("click", handleFileListClick);
  }

  // --- Event Delegation for Queue List ---
  if (queueList) {
    queueList.addEventListener("click", handleQueueListClick);
  }

  // --- Static Buttons ---
  if (clearQueueBtn) {
    clearQueueBtn.addEventListener("click", clearQueue);
  }

  // --- Audio Player Events ---
  if (audioPlayer) {
    audioPlayer.addEventListener("ended", handleSongEnd);
    audioPlayer.addEventListener("timeupdate", updateProgressBar);
    audioPlayer.addEventListener("loadedmetadata", handleNewMetadata);
    audioPlayer.addEventListener("play", () => {
        updatePlayPauseIcon(true);
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "playing";
        }
    });
    audioPlayer.addEventListener("pause", () => {
        updatePlayPauseIcon(false);
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "paused";
        }
    });
    audioPlayer.addEventListener('volumechange', () => {
      if (volumeSlider) volumeSlider.value = Math.round(audioPlayer.volume * 100);
      updateVolCSS();
    });
  }

  // --- Player Controls ---
  setupPlayerControls();

  // --- Seek and Volume Sliders ---
  if (progressBar) {
    progressBar.addEventListener("input", e => (audioPlayer.currentTime = e.target.value));
  }
  if (volumeSlider) {
    volumeSlider.addEventListener("input", e => (audioPlayer.volume = e.target.value / 100));
    volumeSlider.addEventListener("change", () => localStorage.setItem("volume", audioPlayer.volume));
  }

  // --- Browser History Navigation (Back/Forward) ---
  window.addEventListener("popstate", handlePopState);

  // --- Keyboard Shortcuts ---
  document.addEventListener('keydown', handleKeyboardShortcuts);
}

// ========== Event Handler Functions ==========

function handleFileListClick(e) {
  const target = e.target;

  // Back Button - now targets the <li> with id="back-btn"
  if (target.closest("#back-btn")) {
    goBack();
    return;
  }

  // Folder Item - now targets the <li> with class="folder-item"
  const folderItem = target.closest(".folder-item");
  if (folderItem) {
    navigateToFolder(folderItem.dataset.folderId);
    return;
  }

  // Queue Button
  const queueBtn = target.closest(".queue-btn");
  if (queueBtn) {
    e.stopPropagation(); // Prevent the click from also selecting the file
    const fileItem = queueBtn.closest(".file-item");
    if (fileItem) {
      const decodedFileId = decodeHtmlEntities(fileItem.dataset.fileId);
      const fileData = fileList.find(f => f.fileId === decodedFileId);
      if (fileData) {
        addToQueue(fileData.fileId, fileData.fileName);
      }
    }
    return;
  }

  // File Item (Select for playback)
  const fileInfo = target.closest(".file-info");
  if (fileInfo) {
    const fileItem = fileInfo.closest(".file-item");
    if (fileItem) {
      const decodedFileId = decodeHtmlEntities(fileItem.dataset.fileId);
      const fileData = fileList.find(f => f.fileId === decodedFileId);
      if (fileData) {
        selectFile(fileData.fileId, fileData.fileName);
      }
    }
  }
}

function handleQueueListClick(e) {
  const removeBtn = e.target.closest(".remove-btn");
  if (removeBtn) {
    e.stopPropagation(); // Prevents the click from closing the queue
    const item = removeBtn.closest("li");
    if (item && item.dataset.index) {
      removeFromQueue(parseInt(item.dataset.index, 10));
    }
  }
}

function handleGlobalClick(e) {
  // Close hamburger dropdown
  const hamburgerWrapper = document.querySelector('.hamburger-menu-wrapper');
  if (hamburgerWrapper && !hamburgerWrapper.contains(e.target)) {
    hamburgerWrapper.classList.remove('show-dropdown');
  }

  // Close queue sidebar
  const queueContainer = document.getElementById("queue-container");
  const toggleQueueBtn = document.getElementById("toggleQueue");
  if (queueContainer && toggleQueueBtn) {
    if (!queueContainer.contains(e.target) && !toggleQueueBtn.contains(e.target)) {
      toggleQueueVisibility(false);
    }
  }
}

function handleSongEnd() {
  if (repeatMode === "one") {
    playCurrentSong();
    savePlayerState();
  } else if (currentIndex < songQueue.length - 1) {
    currentIndex++;
    playCurrentSong();
  } else if (shuffleOn) {
    playNextShuffledSong();
  } else if (repeatMode === "all" && songQueue.length > 0) {
    currentIndex = 0;
    playCurrentSong();
  } else {
    loadNextFromFileList();
  }
}

function handlePopState(event) {
  const state = event.state;
  const folderId = (state && state.folder_id) ? state.folder_id : "root";
  fetchFolder(folderId);
}

function handleNewMetadata() {
  const audio = document.getElementById("audio-player");
  const progressBar = document.getElementById("progress-bar");
  const durationDisplay = document.getElementById("duration");

  progressBar.max = Math.floor(audio.duration);
  if (durationDisplay) durationDisplay.textContent = formatDuration(audio.duration);
  progressBar.style.setProperty("--played", "0%");
}

function setupPlayerControls() {
  document.getElementById("previousBtn")?.addEventListener("click", previousSong);
  document.getElementById("playPauseBtn")?.addEventListener("click", togglePlayPause);
  document.getElementById("nextBtn")?.addEventListener("click", nextSong);
  document.getElementById("shuffleBtn")?.addEventListener("click", toggleShuffle);
  document.getElementById("repeatBtn")?.addEventListener("click", toggleRepeat);
  document.getElementById("lyrics-button")?.addEventListener("click", openLyrics);
}

function handleKeyboardShortcuts(e) {
  // Ignore shortcuts if user is typing in the search bar
  if (e.target.tagName === 'INPUT') return;

  const audio = document.getElementById("audio-player");
  const key = e.key === ' ' ? 'Space' : (e.code || e.key);

  switch (key) {
    case 'Space':
      e.preventDefault();
      togglePlayPause();
      break;
    case 'ArrowRight':
      e.preventDefault();
      audio.currentTime = Math.min(audio.currentTime + 5, audio.duration);
      break;
    case 'ArrowLeft':
      e.preventDefault();
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
  }
}

// ========== UI Functions ==========

function toggleHamburgerMenu() {
  document.querySelector('.hamburger-menu-wrapper')?.classList.toggle('show-dropdown');
}

function toggleQueueVisibility(force) {
  const queueContainer = document.getElementById("queue-container");
  const mainElem = document.querySelector("main");
  if (!queueContainer || !mainElem) return;

  const isActive = queueContainer.classList.contains("active");
  const show = typeof force === 'boolean' ? force : !isActive;

  queueContainer.classList.toggle("active", show);
  mainElem.classList.toggle("queue-active", show);
}

function clearSearch() {
  const searchInput = document.getElementById("searchInput");
  const clearIcon = document.getElementById("clearSearchBtn");
  if (searchInput) searchInput.value = "";
  if (clearIcon) clearIcon.style.display = "none";

  document.getElementById("fileListContainer").innerHTML = originalFileListHTML;
  updateGlobalFileList();
  applyCachedMetadata();
  startBackgroundMetadataLoad();
}

function updateQueueUI() {
  const queueList = document.getElementById("queue-list");
  if (!queueList) return;
  queueList.innerHTML = "";

  const displayHistoryCount = 3;
  const startIndex = Math.max(0, currentIndex - displayHistoryCount);

  for (let i = startIndex; i < songQueue.length; i++) {
    const song = songQueue[i];
    const metadata = metadataCache[song.fileId]; // Get metadata from cache

    const title = metadata?.title || song.fileName;
    const artistAlbum = [metadata?.artist, metadata?.album].filter(Boolean).join(' - ');
    const artworkSrc = metadata?.album_art || "/static/default-thumbnail.png";

    const listItem = document.createElement("li");
    listItem.setAttribute("draggable", "true");
    listItem.dataset.index = i;
    listItem.className = `queue-song ${i === currentIndex ? "active" : ""}`;

    // Generate HTML similar to a .file-item
    listItem.innerHTML = `
        <img class="queue-thumbnail" src="${artworkSrc}" alt="">
        <div class="queue-item-info">
            <span class="queue-item-title">${title}</span>
            <span class="queue-item-artist-album">${artistAlbum}</span>
        </div>
        <button class="btn remove-btn" aria-label="Remove from queue"><span>&times;</span></button>
    `;

    listItem.addEventListener("dragstart", handleDragStart);
    listItem.addEventListener("dragover", handleDragOver);
    listItem.addEventListener("dragenter", handleDragEnter);
    listItem.addEventListener("dragleave", handleDragLeave);
    listItem.addEventListener("drop", handleDrop);
    listItem.addEventListener("dragend", handleDragEnd);
    queueList.appendChild(listItem);
  }
}

function updatePlayPauseIcon(isPlaying) {
  const playPauseBtn = document.getElementById("playPauseBtn");
  if (playPauseBtn) {
    playPauseBtn.innerHTML = isPlaying
      ? '<i class="fas fa-pause" aria-hidden="true"></i>'
      : '<i class="fas fa-play" aria-hidden="true"></i>';
    playPauseBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  }
}

function formatDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// ========== Folder Navigation & Search ==========

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
      updateGlobalFileList();
      applyCachedMetadata();
      startBackgroundMetadataLoad();
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

function doSearch(query) {
  const container = document.getElementById("fileListContainer");
  query = query.trim().toLowerCase();
  if (!query) {
    container.innerHTML = originalFileListHTML;
    updateGlobalFileList();
    applyCachedMetadata();
    startBackgroundMetadataLoad();
    return;
  }
  const tempContainer = document.createElement("div");
  tempContainer.innerHTML = originalFileListHTML;
  const filteredItems = Array.from(tempContainer.querySelectorAll("li:not(.back-btn)"));

  const results = filteredItems.filter(li => {
    const titleElem = li.querySelector(".file-title");
    const artistAlbumElem = li.querySelector(".artist-album");
    const folderNameElem = li.querySelector(".name");

    const textContent = [
      titleElem?.innerText || '',
      artistAlbumElem?.innerText || '',
      folderNameElem?.innerText || ''
    ].join(' ').toLowerCase();

    return textContent.includes(query);
  });

  const backBtnHTML = tempContainer.querySelector('.back-btn')?.outerHTML || '';
  container.innerHTML = backBtnHTML + results.map(li => li.outerHTML).join("");
  updateGlobalFileList();
  applyCachedMetadata();
  startBackgroundMetadataLoad();
}

// ========== Queue Logic ==========

function addToQueue(fileId, fileName) {
  songQueue.push({ fileId, fileName });
  updateQueueUI();
  savePlayerState();
}

function removeFromQueue(index) {
  songQueue.splice(index, 1);
  if (index < currentIndex) {
    currentIndex--;
  } else if (index === currentIndex && currentIndex >= songQueue.length) {
    currentIndex = songQueue.length > 0 ? songQueue.length - 1 : 0;
  }
  updateQueueUI();
  savePlayerState();
}

function clearQueue() {
  if (confirm("Are you sure you want to clear the queue?")) {
    songQueue = [];
    currentIndex = 0;
    updateQueueUI();
    savePlayerState();
  }
}

// ========== Player Logic ==========

function createAndShuffleDeck() {
  console.log("Creating and shuffling a new deck from fileList.");
  shuffleDeck = [...fileList];

  let m = shuffleDeck.length, t, i;
  while (m) {
    i = Math.floor(Math.random() * m--);
    t = shuffleDeck[m];
    shuffleDeck[m] = shuffleDeck[i];
    shuffleDeck[i] = t;
  }
}

function playNextShuffledSong() {
    if (fileList.length === 0) {
        return; // No songs to shuffle
    }

    if (shuffleDeck.length === 0) {
        console.log("Shuffle deck empty, creating a new one.");
        createAndShuffleDeck();
    }

    const nextSongData = shuffleDeck.pop();
    if (nextSongData) {
        songQueue.push({ fileId: nextSongData.fileId, fileName: nextSongData.fileName });
        currentIndex = songQueue.length - 1;
        playCurrentSong();
    } else if (fileList.length > 0) {
        const freshSongData = shuffleDeck.pop();
        if(freshSongData) {
            songQueue.push({ fileId: freshSongData.fileId, fileName: freshSongData.fileName });
            currentIndex = songQueue.length - 1;
            playCurrentSong();
        }
    }
}

function selectFile(fileId, fileName) {
  console.log("Pausing background metadata loading for priority selection.");
  isQueuePaused = true;

  songQueue.splice(currentIndex + 1, 0, { fileId, fileName });
  currentIndex++;
  playCurrentSong();
}

function playCurrentSong() {
  if (currentIndex >= songQueue.length) {
    if (shuffleOn) {
        playNextShuffledSong();
    } else {
        loadNextFromFileList();
    }
    return;
  }

  const song = songQueue[currentIndex];
  if (!song) {
      console.error("Could not find song at current index.");
      return;
  }
  const fileUrl = `/stream/${song.fileId}`;
  const audio = document.getElementById("audio-player");
  const source = document.getElementById("audio-source");
  const nowPlayingTitle = document.getElementById("now-playing-title");
  const nowPlayingInfo = document.getElementById("now-playing-info");

  source.src = fileUrl;
  audio.load();
  audio.play().catch(err => console.error("Playback error:", err));

  nowPlayingTitle.innerText = song.fileName;
  nowPlayingInfo.innerText = "";
  document.title = `${song.fileName} - StreaMusic`;
  updateQueueUI();

  if (currentMetadataController) {
    currentMetadataController.abort();
  }
  const controller = new AbortController();
  currentMetadataController = controller;

  showMetadata(song.fileId, controller.signal)
    .finally(() => {
        if (!controller.signal.aborted) {
            if(isQueuePaused) {
                console.log("Priority load complete. Resuming background queue.");
                isQueuePaused = false;
                processMetadataQueue(metadataLoadGeneration);
            }
        }
    });

  savePlayerState();
}

function nextSong() {
  if (currentIndex < songQueue.length - 1) {
    currentIndex++;
    playCurrentSong();
  }
  else if (shuffleOn) {
    playNextShuffledSong();
  } else {
    loadNextFromFileList();
  }
}

function previousSong() {
  if (songQueue.length === 0) return;

  const audio = document.getElementById("audio-player");
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
  } else if (currentIndex > 0) {
    currentIndex--;
    playCurrentSong();
  }
}

function togglePlayPause() {
  const audio = document.getElementById("audio-player");
  if (!audio.currentSrc) {
    if (songQueue.length > 0) {
        playCurrentSong();
    } else if (fileList.length > 0) {
        if (shuffleOn) {
            playNextShuffledSong();
        } else {
            selectFile(fileList[0].fileId, fileList[0].fileName);
        }
    }
    return;
  }
  if (audio.paused) {
    audio.play().catch(err => console.error("Play error:", err));
  } else {
    audio.pause();
  }
}

function toggleShuffle() {
  shuffleOn = !shuffleOn;
  document.getElementById("shuffleBtn")?.classList.toggle("active", shuffleOn);

  if (shuffleOn && fileList.length > 0) {
    createAndShuffleDeck();
  } else {
    shuffleDeck = [];
  }

  savePlayerState();
}

function toggleRepeat() {
  const repeatBtn = document.getElementById("repeatBtn");
  if (!repeatBtn) return;

  if (repeatMode === "none") {
    repeatMode = "all";
    repeatBtn.innerHTML = '<i class="fas fa-redo" aria-hidden="true"></i>';
    repeatBtn.classList.add("active");
  } else if (repeatMode === "all") {
    repeatMode = "one";
    repeatBtn.innerHTML = '<i class="fas fa-redo-alt" aria-hidden="true"></i>';
    repeatBtn.classList.add("active");
  } else {
    repeatMode = "none";
    repeatBtn.innerHTML = '<i class="fas fa-redo" aria-hidden="true"></i>';
    repeatBtn.classList.remove("active");
  }
  savePlayerState();
}

// ========== Seekbar, Volume & Metadata Display ==========

function updateProgressBar() {
  const audio = document.getElementById("audio-player");
  const progressBar = document.getElementById("progress-bar");
  const currentTimeDisplay = document.getElementById("current-time");

  if (isNaN(audio.duration)) return;

  const progress = Math.floor(audio.currentTime);
  progressBar.value = progress;
  progressBar.style.setProperty("--played", `${(audio.currentTime / audio.duration) * 100}%`);
  if (currentTimeDisplay) currentTimeDisplay.textContent = formatDuration(audio.currentTime);
}

function updateVolCSS() {
  const volumeSlider = document.getElementById('volume-slider');
  if (volumeSlider) {
    const pct = volumeSlider.value + '%';
    volumeSlider.style.setProperty('--volplayed', pct);
  }
}

function updatePlayerMetadataUI(metadata) {
    const albumArtwork = document.getElementById("album-artwork");
    const nowPlayingTitle = document.getElementById("now-playing-title");
    const nowPlayingInfo = document.getElementById("now-playing-info");
    const currentSong = songQueue[currentIndex];

    const displayTitle = metadata?.title || currentSong?.fileName || "No Title";
    const displayArtist = metadata?.artist || "";
    const displayAlbum = metadata?.album || "";
    const displayArtworkSrc = metadata?.album_art || "/static/default-thumbnail.png";

    albumArtwork.src = displayArtworkSrc;
    nowPlayingTitle.textContent = displayTitle;
    nowPlayingInfo.textContent = [displayArtist, displayAlbum].filter(Boolean).join(" - ");
    document.title = `${displayTitle} - StreaMusic`;

    let mediaSessionArtworkSrc = displayArtworkSrc;
    if (mediaSessionArtworkSrc.startsWith('/')) {
        mediaSessionArtworkSrc = `${window.location.origin}${mediaSessionArtworkSrc}`;
    }

    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: displayTitle,
            artist: displayArtist,
            album: displayAlbum,
            artwork: [
                { src: mediaSessionArtworkSrc, sizes: '256x256', type: 'image/png' },
                { src: mediaSessionArtworkSrc, sizes: '512x512', type: 'image/png' },
            ]
        });
    }
}

function showMetadata(fileId, signal) {
  const cachedData = metadataCache[fileId];
  if (cachedData) {
    updatePlayerMetadataUI(cachedData);
    return Promise.resolve(cachedData);
  }

  return fetch(`/metadata/${encodeURIComponent(fileId)}`, { signal })
    .then(checkAuthResponse)
    .then(response => response.json())
    .then(data => {
      if (signal.aborted) return;
      metadataCache[fileId] = data;
      updatePlayerMetadataUI(data);
      const itemElem = document.querySelector(`.file-item[data-file-id='${fileId}']`);
      updateItemMetadata(itemElem, data);
      return data;
    })
    .catch(err => {
      if (err.name !== "AbortError") {
        console.error("Metadata fetch error:", err);
        updatePlayerMetadataUI(null);
      }
      throw err;
    });
}

// ========== State Management (Local Storage) ==========

function savePlayerState() {
  try {
    const state = {
        queue: songQueue.slice(0, 50),
        currentIndex,
        shuffle: shuffleOn,
        repeat: repeatMode,
        shuffleDeck: shuffleDeck,
    };
    localStorage.setItem("musicPlayerState", JSON.stringify(state));
  } catch (e) {
    console.error("Could not save player state:", e);
  }
}

function loadPlayerState() {
  const stateStr = localStorage.getItem("musicPlayerState");
  if (stateStr) {
    try {
      const state = JSON.parse(stateStr);
      songQueue = (state.queue || []).map(song => ({
          ...song,
          fileName: decodeHtmlEntities(song.fileName)
      }));

      let loadedIndex = state.currentIndex || 0;
      if (loadedIndex >= songQueue.length) {
          loadedIndex = Math.max(0, songQueue.length - 1);
      }
      currentIndex = loadedIndex;

      shuffleOn = state.shuffle || false;
      shuffleDeck = state.shuffleDeck || [];
      repeatMode = state.repeat || "none";

      document.getElementById("shuffleBtn")?.classList.toggle("active", shuffleOn);
      const repeatBtn = document.getElementById("repeatBtn");
      if(repeatBtn) {
        repeatBtn.classList.toggle("active", repeatMode !== "none");
        if (repeatMode === 'one') {
          repeatBtn.innerHTML = '<i class="fas fa-redo-alt" aria-hidden="true"></i>';
        } else {
          repeatBtn.innerHTML = '<i class="fas fa-redo" aria-hidden="true"></i>';
        }
      }

      if (shuffleOn && shuffleDeck.length === 0 && fileList.length > 0) {
          console.log("Loaded shuffle state but deck is empty. Recreating deck.");
          createAndShuffleDeck();
      }

      updateQueueUI();
      if(songQueue.length > 0 && songQueue[currentIndex]) {
        const song = songQueue[currentIndex];
        const nowPlayingTitle = document.getElementById("now-playing-title");
        if (nowPlayingTitle && song) {
            nowPlayingTitle.textContent = song.fileName;
            document.title = `${song.fileName} - StreaMusic`;
            showMetadata(song.fileId, new AbortController().signal);
        }
      } else {
          updatePlayerMetadataUI(null);
      }

    } catch (e) {
      console.error("Error parsing saved player state", e);
      localStorage.removeItem("musicPlayerState");
    }
  }

  const savedVolume = localStorage.getItem("volume");
  if (savedVolume !== null) {
    document.getElementById("audio-player").volume = savedVolume;
  }
}

// ========== Background Metadata Loading ==========

function startBackgroundMetadataLoad() {
    metadataLoadGeneration++;
    isQueuePaused = false;
    backgroundMetadataQueue = fileList
        .map(file => file.fileId)
        .filter(fileId => !metadataCache[fileId]);

    processMetadataQueue(metadataLoadGeneration);
}

async function processMetadataQueue(generation) {
    if (generation !== metadataLoadGeneration) {
      return;
    }

    if (isQueuePaused || backgroundMetadataQueue.length === 0) {
        return;
    }

    const batchSize = 15;
    const batch = backgroundMetadataQueue.splice(0, batchSize);

    const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

    try {
        const response = await fetch('/metadata/batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({ ids: batch })
        });

        if (!response.ok) throw new Error(`Batch metadata fetch failed with status ${response.status}`);

        const metadataResults = await response.json();

        for (const fileId in metadataResults) {
          if (generation !== metadataLoadGeneration) return;
          const data = metadataResults[fileId];
          metadataCache[fileId] = data;
          const itemElem = document.querySelector(`.file-item[data-file-id='${fileId}']`);
          if (itemElem) {
              updateItemMetadata(itemElem, data);
          }
        }
    } catch (error) {
        console.error("Error processing metadata batch:", error);
    }

    if (generation === metadataLoadGeneration) {
      setTimeout(() => processMetadataQueue(generation), 50);
    }
}

function updateItemMetadata(itemElem, data) {
  if (!itemElem) return;
  const thumbElem = itemElem.querySelector('.file-thumbnail');
  const titleElem = itemElem.querySelector('.file-title');
  const artistAlbumElem = itemElem.querySelector('.artist-album');

  if (thumbElem && data.album_art) {
    thumbElem.src = data.album_art;
  }
  if (titleElem && data.title) {
    titleElem.textContent = data.title;
  }
  if (artistAlbumElem) {
    artistAlbumElem.textContent = [data.artist, data.album].filter(Boolean).join(' - ');
  }
}

function applyCachedMetadata() {
  const fileItems = document.querySelectorAll(".file-item[data-file-id]");
  fileItems.forEach(itemElem => {
    const fileId = decodeHtmlEntities(itemElem.dataset.fileId);
    if (metadataCache[fileId]) {
      updateItemMetadata(itemElem, metadataCache[fileId]);
    }
  });
}


function updateGlobalFileList() {
  fileList = Array.from(document.querySelectorAll(".file-item"))
    .map(item => {
        const fileId = decodeHtmlEntities(item.dataset.fileId);
        const fileName = decodeHtmlEntities(item.dataset.fileName);
        return { fileId, fileName };
    })
    .filter(item => item.fileId);

  if (shuffleOn) {
      console.log("File list changed, resetting shuffle deck.");
      createAndShuffleDeck();
  }
}

function loadNextFromFileList() {
    if (fileList.length === 0) {
        console.log("File list is empty, cannot load next song.");
        return;
    }

    let nextFileIndex = 0;

    if (songQueue.length > 0 && songQueue[currentIndex]) {
        const lastPlayedFileId = songQueue[currentIndex].fileId;
        const lastPlayedIndexInFileList = fileList.findIndex(item => item.fileId === lastPlayedFileId);

        if (lastPlayedIndexInFileList > -1 && lastPlayedIndexInFileList < fileList.length - 1) {
            nextFileIndex = lastPlayedIndexInFileList + 1;
        }
    }

    const nextSongToAdd = fileList[nextFileIndex];

    songQueue.push({ fileId: nextSongToAdd.fileId, fileName: nextSongToAdd.fileName });
    currentIndex = songQueue.length - 1;
    playCurrentSong();
}

// ========== Media Session API Integration ==========
function setupMediaSession() {
  if ('mediaSession' in navigator) {
    console.log("Setting up Media Session API");
    navigator.mediaSession.setActionHandler('play', togglePlayPause);
    navigator.mediaSession.setActionHandler('pause', togglePlayPause);
    navigator.mediaSession.setActionHandler('nexttrack', nextSong);
    navigator.mediaSession.setActionHandler('previoustrack', previousSong);
  }
}

// ========== Drag-and-Drop for Queue ==========
let dragSrcEl = null;

function handleDragStart(e) {
  dragSrcEl = this;
  this.style.opacity = "0.5";
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", this.dataset.index);
}
function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  return false;
}
function handleDragEnter(e) { this.classList.add("drag-over"); }
function handleDragLeave(e) { this.classList.remove("drag-over"); }
function handleDrop(e) {
  e.stopPropagation();
  if (dragSrcEl !== this) {
    const srcIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    const destIndex = parseInt(this.dataset.index, 10);

    const movedItem = songQueue.splice(srcIndex, 1)[0];
    songQueue.splice(destIndex, 0, movedItem);

    if (srcIndex === currentIndex) {
      currentIndex = destIndex;
    } else if (srcIndex < currentIndex && destIndex >= currentIndex) {
      currentIndex--;
    } else if (srcIndex > currentIndex && destIndex <= currentIndex) {
      currentIndex++;
    }
    updateQueueUI();
    savePlayerState();
  }
  return false;
}
function handleDragEnd(e) {
  this.style.opacity = "1";
  document.querySelectorAll("#queue-list li").forEach(item => item.classList.remove("drag-over"));
}

// ========== Utilities ==========
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function decodeHtmlEntities(text) {
    if (!text) return "";
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

function openLyrics() {
    const title = document.getElementById("now-playing-title").textContent;
    const info = document.getElementById("now-playing-info").textContent;
    if (!title) return;

    const artist = info.split(' - ')[0].trim();
    const searchQuery = encodeURIComponent(`${artist} ${title}`);
    const geniusURL = `https://genius.com/search?q=${searchQuery}`;
    window.open(geniusURL, '_blank');
}