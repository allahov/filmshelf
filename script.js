const SUPABASE_URL = "https://roovratpatxubbdgzrtr.supabase.co";
const SUPABASE_KEY = "sb_publishable_8kKEZ9yGoDiwVKMvcwYqZg_5T8bNNln";
const LEGACY_STORAGE_KEYS = [
  "filmshelf_movies_v1",
  "filmshelf_movies_v2",
  "filmshelf_movies_v3",
  "filmshelf_movies_v4"
];
const MOVIES_ENDPOINT = `${SUPABASE_URL}/rest/v1/movies`;

const genres = [
  "All", "Drama", "Comedy", "Thriller", "Crime", "Romance", "Action",
  "Adventure", "Fantasy", "Sci-Fi", "Horror", "Documentary",
  "Animation", "Biography", "History", "Family"
];

const countries = [
  "USA", "UK", "France", "Italy", "Spain", "Germany", "Armenia", "Russia",
  "Japan", "South Korea", "China", "India", "Turkey", "Iran", "Georgia",
  "Canada", "Australia", "Mexico", "Brazil", "Argentina", "Sweden",
  "Norway", "Denmark", "Finland", "Netherlands", "Belgium", "Poland",
  "Czech Republic", "Greece", "Ireland", "Israel", "Ukraine"
];

let supabase = null;
let session = null;
let movies = [];
let activeType = "all";
let activeGenre = "All";
let activeView = "watchlist";
let selectedPoster = "";
let editingId = null;
let isLoading = true;
let legacyImportInProgress = false;

const shelfEl = document.getElementById("watchlist");
const genresEl = document.getElementById("genres");
const shelfTitle = document.getElementById("shelfTitle");
const shelfSubtitle = document.getElementById("shelfSubtitle");
const modal = document.getElementById("modal");
const openModal = document.getElementById("openModal");
const closeModal = document.getElementById("closeModal");
const saveMovie = document.getElementById("saveMovie");
const deleteMovie = document.getElementById("deleteMovie");
const modalTitle = document.getElementById("modalTitle");
const titleInput = document.getElementById("titleInput");
const posterInput = document.getElementById("posterInput");
const imagePreview = document.getElementById("imagePreview");
const typeInput = document.getElementById("typeInput");
const genreInput = document.getElementById("genreInput");
const yearInput = document.getElementById("yearInput");
const countryInput = document.getElementById("countryInput");
const countryList = document.getElementById("countryList");
const yearList = document.getElementById("yearList");

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getAccessToken() {
  return session?.access_token || "";
}

function supabaseHeaders(extraHeaders = {}) {
  const accessToken = getAccessToken();

  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...extraHeaders
  };
}

async function loadSupabaseClient() {
  const module = await import("https://esm.sh/@supabase/supabase-js@2");
  return module.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

async function refreshSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error(error);
    session = null;
    return null;
  }

  session = data.session;
  return session;
}

async function signInWithEmail(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin
    }
  });

  if (error) throw error;
}

async function signOut() {
  await supabase.auth.signOut();
  session = null;
  movies = [];
  renderAuthState();
  render();
}

async function fetchMoviesFromCloud() {
  const response = await fetch(`${MOVIES_ENDPOINT}?select=*&order=created_at.desc`, {
    headers: supabaseHeaders()
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Could not load movies");
  }

  const data = await response.json();
  return Array.isArray(data) ? dedupeMovies(data) : [];
}

async function createMovieInCloud(movie) {
  const response = await fetch(MOVIES_ENDPOINT, {
    method: "POST",
    headers: supabaseHeaders({
      Prefer: "return=representation"
    }),
    body: JSON.stringify(movie)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Could not add movie");
  }

  const data = await response.json();
  return data[0];
}

async function updateMovieInCloud(id, updates) {
  const response = await fetch(`${MOVIES_ENDPOINT}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: supabaseHeaders({
      Prefer: "return=representation"
    }),
    body: JSON.stringify(updates)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Could not update movie");
  }

  const data = await response.json();
  return data[0];
}

async function deleteMovieFromCloud(id) {
  const response = await fetch(`${MOVIES_ENDPOINT}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: supabaseHeaders()
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Could not delete movie");
  }
}

function makeMovieKey(movie) {
  const title = String(movie.title || "").trim().toLowerCase();
  const year = String(movie.year || "").trim();
  return `${title}__${year}`;
}

function normalizeMovieKey(movie) {
  const title = String(movie.title || "").trim().toLowerCase();
  const year = String(movie.year || "").trim();
  const type = String(movie.type || "").trim().toLowerCase();
  const status = String(movie.status || "").trim().toLowerCase();

  return `${title}__${year}__${type}__${status}`;
}

function dedupeMovies(list) {
  const seen = new Set();
  const result = [];

  for (const movie of list) {
    const key = normalizeMovieKey(movie);

    if (!key.trim() || seen.has(key)) continue;

    seen.add(key);
    result.push(movie);
  }

  return result;
}

function movieAlreadyExists(moviePayload, list = movies) {
  const key = normalizeMovieKey(moviePayload);
  return list.some((movie) => normalizeMovieKey(movie) === key);
}

function loadLegacyMoviesFromAllKeys() {
  const found = [];
  const seen = new Set();

  for (const key of LEGACY_STORAGE_KEYS) {
    const saved = localStorage.getItem(key);

    if (!saved) continue;

    try {
      const parsed = JSON.parse(saved);

      if (!Array.isArray(parsed)) continue;

      for (const movie of parsed) {
        if (!movie || !movie.title) continue;

        const movieKey = makeMovieKey(movie);

        if (!movieKey.trim() || seen.has(movieKey)) continue;

        seen.add(movieKey);
        found.push({
          ...movie,
          _legacyKey: key
        });
      }
    } catch (error) {
      console.warn(`Could not read ${key}`, error);
    }
  }

  return found;
}

function prepareMovieForCloud(movie) {
  return {
    title: String(movie.title || "Untitled").trim(),
    poster: movie.poster || "",
    type: movie.type || "movie",
    genre: movie.genre || "",
    year: movie.year ? String(movie.year) : "",
    country: movie.country || "",
    status: movie.status === "watched" ? "watched" : "watchlist"
  };
}

function isStarterMovie(movie) {
  const starterTitles = ["La La Land", "The Crown", "Amélie", "Only Murders in the Building"];
  return starterTitles.includes(movie.title);
}

function findMissingLegacyMovies() {
  const cloudKeys = new Set(movies.map(makeMovieKey));

  return loadLegacyMoviesFromAllKeys()
    .filter((movie) => movie && movie.title)
    .filter((movie) => !isStarterMovie(movie))
    .filter((movie) => !cloudKeys.has(makeMovieKey(movie)));
}

async function offerLegacyImportIfNeeded() {
  if (legacyImportInProgress || !session?.user?.id) return;

  const importDoneKey = `filmshelf_legacy_import_done_${session.user.id}`;
  const missingLegacyMovies = findMissingLegacyMovies();

  if (!missingLegacyMovies.length) {
    localStorage.setItem(importDoneKey, "yes");
    return;
  }

  const titlesPreview = missingLegacyMovies
    .slice(0, 6)
    .map((movie) => `• ${movie.title}${movie.year ? ` (${movie.year})` : ""}`)
    .join("\n");

  const moreText = missingLegacyMovies.length > 6
    ? `\n...and ${missingLegacyMovies.length - 6} more`
    : "";

  const confirmed = window.confirm(
    `I found ${missingLegacyMovies.length} old movie(s) on this device that are not in your cloud shelf yet:\n\n${titlesPreview}${moreText}\n\nImport them now?`
  );

  if (!confirmed) return;

  legacyImportInProgress = true;

  try {
    for (const movie of missingLegacyMovies) {
      await createMovieInCloud(prepareMovieForCloud(movie));
    }

    movies = await fetchMoviesFromCloud();
    localStorage.setItem(importDoneKey, "yes");
    render();

    alert("Old shelf imported successfully.");
  } catch (error) {
    console.error(error);
    alert("Could not import old shelf. Please try again.");
  } finally {
    legacyImportInProgress = false;
  }
}

function getProfileMenu() {
  let wrapper = document.getElementById("profileMenuWrapper");

  if (wrapper) return wrapper;

  wrapper = document.createElement("div");
  wrapper.id = "profileMenuWrapper";
  wrapper.style.position = "fixed";
  wrapper.style.top = "18px";
  wrapper.style.right = "22px";
  wrapper.style.zIndex = "60";
  wrapper.style.display = "none";

  wrapper.innerHTML = `
    <button id="profileAvatarButton" type="button" aria-label="Profile menu" style="
      width: 46px;
      height: 46px;
      border-radius: 50%;
      border: 1px solid rgba(20,18,23,.12);
      background: rgba(255,255,255,.94);
      color: #7c6cf2;
      font-weight: 900;
      font-size: 18px;
      cursor: pointer;
      box-shadow: 0 16px 38px rgba(31,24,55,.14);
      backdrop-filter: blur(10px);
      display: grid;
      place-items: center;
    ">A</button>

    <div id="profileDropdown" style="
      position: absolute;
      top: 56px;
      right: 0;
      width: min(280px, calc(100vw - 32px));
      padding: 16px;
      border-radius: 22px;
      background: rgba(255,255,255,.97);
      border: 1px solid rgba(20,18,23,.10);
      box-shadow: 0 24px 70px rgba(31,24,55,.18);
      backdrop-filter: blur(14px);
      display: none;
    ">
      <div style="display:flex; align-items:center; gap:12px; padding-bottom:14px; border-bottom:1px solid rgba(20,18,23,.10);">
        <div id="profileAvatarLarge" style="
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: #ede8ff;
          color: #7c6cf2;
          display:grid;
          place-items:center;
          font-weight:900;
          font-size:17px;
          flex:0 0 auto;
        ">A</div>

        <div style="min-width:0;">
          <strong id="profileName" style="
            display:block;
            color:#141217;
            font-size:14px;
            line-height:1.2;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          ">FilmShelf user</strong>
          <span id="profileEmail" style="
            display:block;
            color:#777180;
            font-size:12px;
            margin-top:4px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          "></span>
        </div>
      </div>

      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 0; border-bottom:1px solid rgba(20,18,23,.10);">
        <span style="color:#201d27; font-size:13px; font-weight:800;">Cloud sync</span>
        <span style="color:#5e50d8; background:#ede8ff; border-radius:999px; padding:6px 10px; font-size:12px; font-weight:900;">On</span>
      </div>

      <button id="profileSignOutButton" type="button" style="
        width:100%;
        margin-top:12px;
        padding:12px 14px;
        border-radius:16px;
        border:1px solid rgba(20,18,23,.12);
        background:rgba(255,255,255,.9);
        color:#201d27;
        font-weight:900;
        cursor:pointer;
        text-align:center;
      ">Sign out</button>
    </div>
  `;

  document.body.appendChild(wrapper);

  const avatarButton = document.getElementById("profileAvatarButton");
  const dropdown = document.getElementById("profileDropdown");
  const signOutButton = document.getElementById("profileSignOutButton");

  avatarButton.onclick = (event) => {
    event.stopPropagation();
    dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
  };

  dropdown.onclick = (event) => event.stopPropagation();

  signOutButton.onclick = async () => {
    dropdown.style.display = "none";
    await signOut();
  };

  document.addEventListener("click", () => {
    dropdown.style.display = "none";
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") dropdown.style.display = "none";
  });

  return wrapper;
}

function getUserInitial(email) {
  if (!email) return "A";
  return email.trim().charAt(0).toUpperCase();
}

function renderAuthState() {
  const wrapper = getProfileMenu();

  if (!session) {
    wrapper.style.display = "none";
    return;
  }

  const email = session.user?.email || "";
  const initial = getUserInitial(email);

  wrapper.style.display = "block";

  document.getElementById("profileAvatarButton").textContent = initial;
  document.getElementById("profileAvatarLarge").textContent = initial;
  document.getElementById("profileName").textContent = email ? email.split("@")[0] : "FilmShelf user";
  document.getElementById("profileEmail").textContent = email;

  const dropdown = document.getElementById("profileDropdown");
  if (dropdown) dropdown.style.display = "none";
}

function renderSignInShelf() {
  shelfEl.innerHTML = `
    <div class="empty" style="
      width: 100%;
      max-width: 560px;
      margin: 8px auto 0;
      padding: 38px 28px;
      border-radius: 30px;
      background: rgba(255,255,255,.78);
      border: 1px solid rgba(20,18,23,.10);
      box-shadow: 0 14px 34px rgba(31,24,55,.08);
      font-family: Inter, sans-serif;
      font-size: 16px;
      color: #201d27;
    ">
      <strong style="
        display:block;
        font-family: Caveat, cursive;
        font-size: 42px;
        color: #141217;
        margin-bottom: 8px;
      ">Sign in to sync your movies</strong>

      <span style="
        display:block;
        color: #777180;
        font-size: 14px;
        line-height: 1.45;
        margin-bottom: 20px;
      ">across all your devices.</span>

      <button id="openSignInModal" type="button" style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-width: 170px;
        height: 50px;
        padding: 0 22px;
        border-radius: 999px;
        border: 0;
        background: #7c6cf2;
        color: #fff;
        font-size: 15px;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 18px 42px rgba(124,108,242,.30);
      ">Sign in</button>
    </div>
  `;

  document.getElementById("openSignInModal").onclick = openSignInModal;
}

function ensureSignInModal() {
  let authModal = document.getElementById("authModal");

  if (authModal) {
    return authModal;
  }

  authModal = document.createElement("div");
  authModal.id = "authModal";
  authModal.className = "modal hidden";
  authModal.innerHTML = `
    <div class="modal-card">
      <button id="closeAuthModal" class="close" type="button" aria-label="Close modal">×</button>

      <h2>Sign in</h2>

      <label for="authEmailInput">Email</label>
      <input id="authEmailInput" type="email" placeholder="your@email.com">

      <button id="authEmailButton" class="save" type="button">Continue</button>

      <p id="authMessage" style="
        margin: 14px 0 0;
        color: #777180;
        font-size: 13px;
        line-height: 1.4;
      "></p>
    </div>
  `;

  document.body.appendChild(authModal);

  const closeAuthModal = document.getElementById("closeAuthModal");

  closeAuthModal.onclick = closeSignInModal;

  authModal.onclick = (event) => {
    if (event.target === authModal) {
      closeSignInModal();
    }
  };

  return authModal;
}

function openSignInModal() {
  const authModal = ensureSignInModal();
  const emailInput = document.getElementById("authEmailInput");
  const emailButton = document.getElementById("authEmailButton");
  const authMessage = document.getElementById("authMessage");

  authMessage.textContent = "";
  emailInput.value = "";

  emailButton.onclick = async () => {
    const email = emailInput.value.trim();

    if (!email) {
      emailInput.focus();
      return;
    }

    emailButton.disabled = true;
    emailButton.textContent = "Sending...";

    try {
      await signInWithEmail(email);
      authMessage.textContent = "Check your email. We sent you a magic link. Open it on this device.";
    } catch (error) {
      console.error(error);
      authMessage.textContent = "Could not send magic link. Check Supabase Auth settings.";
    } finally {
      emailButton.disabled = false;
      emailButton.textContent = "Continue";
    }
  };

  authModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  setTimeout(() => emailInput.focus(), 80);
}

function closeSignInModal() {
  const authModal = document.getElementById("authModal");

  if (!authModal) {
    return;
  }

  authModal.classList.add("hidden");

  if (modal.classList.contains("hidden")) {
    document.body.classList.remove("modal-open");
  }
}

function initLists() {
  countryList.innerHTML = countries
    .map(country => `<option value="${escapeHTML(country)}"></option>`)
    .join("");

  const currentYear = new Date().getFullYear() + 1;
  let years = "";

  for (let year = currentYear; year >= 1900; year--) {
    years += `<option value="${year}"></option>`;
  }

  yearList.innerHTML = years;
}

function initGenres() {
  genresEl.innerHTML = "";
  genreInput.innerHTML = "";

  genres.forEach((genre) => {
    const chip = document.createElement("button");
    chip.className = `genre ${genre === activeGenre ? "active" : ""}`;
    chip.type = "button";
    chip.textContent = genre;

    chip.onclick = () => {
      activeGenre = genre;
      render();
    };

    genresEl.appendChild(chip);

    if (genre !== "All") {
      const option = document.createElement("option");
      option.value = genre;
      option.textContent = genre;
      genreInput.appendChild(option);
    }
  });
}

function filteredMovies() {
  return movies.filter((movie) => {
    return movie.status === activeView &&
      (activeType === "all" || movie.type === activeType) &&
      (activeGenre === "All" || movie.genre === activeGenre);
  });
}

function posterHTML(movie) {
  const title = escapeHTML(movie.title || "Saved title");

  if (movie.poster) {
    return `<img class="poster" src="${movie.poster}" alt="${title}">`;
  }

  return `<div class="poster">${title}</div>`;
}

function createFrame(movie) {
  const frame = document.createElement("article");
  frame.className = "frame";
  frame.dataset.id = movie.id;

  const title = escapeHTML(movie.title || "Untitled");
  const year = escapeHTML(movie.year || "—");
  const country = escapeHTML(movie.country || "—");
  const genre = escapeHTML(movie.genre || "No genre");
  const typeLabel = movie.type === "series" ? "TV Series" : "Movie";
  const actionText = activeView === "watchlist" ? "✓ Watched" : "↩ Move back";

  frame.innerHTML = `
    <div class="frame-inner">
      ${posterHTML(movie)}
      <div class="meta">
        <h3>${title}</h3>
        <p>${year} · ${country}</p>
        <p>${typeLabel}</p>
        <span class="badge">${genre}</span>
        <button data-toggle="${movie.id}" type="button">${actionText}</button>
      </div>
    </div>
  `;

  frame.onclick = (event) => {
    if (event.target.closest("[data-toggle]")) return;
    openEditModal(movie.id);
  };

  return frame;
}

function updateHeader() {
  if (activeView === "watchlist") {
    shelfTitle.textContent = "My film shelf";
    shelfSubtitle.textContent = "Movies waiting on your shelf";
  } else {
    shelfTitle.textContent = "Watched";
    shelfSubtitle.textContent = "Movies you have already watched";
  }
}

function render() {
  initGenres();
  updateHeader();

  shelfEl.innerHTML = "";

  if (!session) {
    renderSignInShelf();
    return;
  }

  if (isLoading) {
    shelfEl.innerHTML = `<div class="empty">Loading your shelf...</div>`;
    return;
  }

  const list = filteredMovies();

  if (!list.length) {
    shelfEl.innerHTML = `<div class="empty">Your shelf is empty</div>`;
  } else {
    list.forEach((movie) => shelfEl.appendChild(createFrame(movie)));
  }

  attachToggleEvents();
}

function showCloudError(error) {
  console.error(error);
  alert("Cloud sync error. Please check Supabase settings and try again.");
}

function setSavingState(isSaving) {
  saveMovie.disabled = isSaving;
  saveMovie.textContent = isSaving ? "Saving..." : (editingId ? "Save changes" : "Add to shelf");
}

function attachToggleEvents() {
  document.querySelectorAll("[data-toggle]").forEach((button) => {
    button.onclick = async (event) => {
      event.stopPropagation();

      const id = button.dataset.toggle;
      const movie = movies.find((item) => item.id === id);
      const frame = document.querySelector(`.frame[data-id="${id}"]`);

      if (!movie) return;

      const newStatus = movie.status === "watchlist" ? "watched" : "watchlist";

      if (frame) frame.classList.add("watching-out");

      try {
        await updateMovieInCloud(id, { status: newStatus });

        movies = movies.map((item) => {
          if (item.id !== id) return item;
          return { ...item, status: newStatus };
        });

        setTimeout(() => render(), 220);
      } catch (error) {
        if (frame) frame.classList.remove("watching-out");
        showCloudError(error);
      }
    };
  });
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    activeType = tab.dataset.type;
    render();
  };
});

document.querySelectorAll(".view-tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".view-tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    activeView = tab.dataset.view;
    render();
  };
});

openModal.onclick = () => {
  if (!session) {
    alert("Sign in first to add movies to your cloud shelf.");
    return;
  }

  openAddModal();
};

closeModal.onclick = () => closeMovieModal();

modal.onclick = (event) => {
  if (event.target === modal) closeMovieModal();
};

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.classList.contains("hidden")) {
    closeMovieModal();
  }
});

posterInput.onchange = () => {
  const file = posterInput.files[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = (event) => {
    selectedPoster = event.target.result;

    imagePreview.innerHTML = `
      <img src="${selectedPoster}" alt="Selected poster">
    `;
  };

  reader.readAsDataURL(file);
};

function openAddModal() {
  editingId = null;
  modalTitle.textContent = "Add to shelf";
  saveMovie.textContent = "Add to shelf";
  deleteMovie.classList.add("hidden");
  resetForm();
  openMovieModal();
}

function openEditModal(id) {
  const movie = movies.find((item) => item.id === id);

  if (!movie) return;

  editingId = id;
  selectedPoster = movie.poster || "";

  modalTitle.textContent = movie.title?.trim() || "Edit card";
  saveMovie.textContent = "Save changes";
  deleteMovie.classList.remove("hidden");

  titleInput.value = movie.title || "";
  yearInput.value = movie.year || "";
  countryInput.value = movie.country || "";
  typeInput.value = movie.type || "movie";
  genreInput.value = movie.genre || "Drama";
  posterInput.value = "";

  if (selectedPoster) {
    imagePreview.innerHTML = `<img src="${selectedPoster}" alt="Selected poster">`;
  } else {
    imagePreview.innerHTML = `
      <strong>+</strong>
      <small>Choose image</small>
    `;
  }

  openMovieModal();
}

function openMovieModal() {
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeMovieModal() {
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  editingId = null;
}

function resetForm() {
  titleInput.value = "";
  yearInput.value = "";
  countryInput.value = "";
  typeInput.value = "movie";
  genreInput.value = "Drama";
  posterInput.value = "";
  selectedPoster = "";

  imagePreview.innerHTML = `
    <strong>+</strong>
    <small>Choose image</small>
  `;
}

saveMovie.onclick = async () => {
  const title = titleInput.value.trim();

  if (!title) {
    titleInput.focus();
    return;
  }

  setSavingState(true);

  const moviePayload = {
    title,
    poster: selectedPoster,
    type: typeInput.value,
    genre: genreInput.value || "",
    year: yearInput.value.trim(),
    country: countryInput.value.trim()
  };

  try {
    if (editingId) {
      const updatedMovie = await updateMovieInCloud(editingId, moviePayload);

      movies = movies.map((movie) => {
        if (movie.id !== editingId) return movie;
        return updatedMovie;
      });

      movies = dedupeMovies(movies);
    } else {
      const status = activeView === "watched" ? "watched" : "watchlist";
      const newMoviePayload = {
        ...moviePayload,
        status
      };

      if (movieAlreadyExists(newMoviePayload)) {
        alert("This title is already on this shelf.");
        return;
      }

      const newMovie = await createMovieInCloud(newMoviePayload);

      movies.unshift(newMovie);
      movies = dedupeMovies(movies);
    }

    resetForm();
    closeMovieModal();
    render();
  } catch (error) {
    showCloudError(error);
  } finally {
    setSavingState(false);
  }
};

deleteMovie.onclick = async () => {
  if (!editingId) return;

  const movie = movies.find((item) => item.id === editingId);
  const title = movie?.title || "this card";
  const confirmed = window.confirm(`Delete "${title}" from your shelf?`);

  if (!confirmed) return;

  try {
    await deleteMovieFromCloud(editingId);

    movies = movies.filter((movie) => movie.id !== editingId);

    resetForm();
    closeMovieModal();
    render();
  } catch (error) {
    showCloudError(error);
  }
};

async function loadCloudShelf() {
  isLoading = true;
  render();

  try {
    movies = await fetchMoviesFromCloud();
  } catch (error) {
    showCloudError(error);
    movies = [];
  } finally {
    isLoading = false;
    render();
  }
}


function enableDesktopDragScroll(element) {
  if (!element) return;

  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;
  let moved = false;

  element.style.cursor = "grab";

  element.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;

    isDown = true;
    moved = false;
    startX = event.pageX - element.offsetLeft;
    scrollLeft = element.scrollLeft;
    element.style.cursor = "grabbing";
  });

  element.addEventListener("mouseleave", () => {
    isDown = false;
    element.style.cursor = "grab";
  });

  element.addEventListener("mouseup", () => {
    isDown = false;
    element.style.cursor = "grab";

    setTimeout(() => {
      moved = false;
    }, 0);
  });

  element.addEventListener("mousemove", (event) => {
    if (!isDown) return;

    event.preventDefault();

    const x = event.pageX - element.offsetLeft;
    const walk = (x - startX) * 1.4;

    if (Math.abs(walk) > 5) moved = true;

    element.scrollLeft = scrollLeft - walk;
  });

  element.addEventListener("click", (event) => {
    if (!moved) return;

    event.preventDefault();
    event.stopPropagation();
  }, true);
}


async function initApp() {
  initLists();
  enableDesktopDragScroll(shelfEl);

  supabase = await loadSupabaseClient();
  await refreshSession();

  supabase.auth.onAuthStateChange(async (_event, newSession) => {
    session = newSession;
    renderAuthState();

    if (session) {
      closeSignInModal();
      await loadCloudShelf();
      // Legacy local import is disabled after initial migration to prevent duplicates.
    } else {
      movies = [];
      render();
    }
  });

  renderAuthState();

  if (session) {
    await loadCloudShelf();
    // Legacy local import is disabled after initial migration to prevent duplicates.
  } else {
    isLoading = false;
    render();
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

initApp();
