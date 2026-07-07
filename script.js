const SUPABASE_URL = "https://roovratpatxubbdgzrtr.supabase.co";
const SUPABASE_KEY = "sb_publishable_8kKEZ9yGoDiwVKMvcwYqZg_5T8bNNln";
const LEGACY_STORAGE_KEY = "filmshelf_movies_v4";
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

  if (error) {
    throw error;
  }
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
  return Array.isArray(data) ? data : [];
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

function loadLegacyMovies() {
  const saved = localStorage.getItem(LEGACY_STORAGE_KEY);

  if (!saved) {
    return [];
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

async function offerLegacyImportIfNeeded() {
  const legacyMovies = loadLegacyMovies()
    .filter((movie) => movie && movie.title)
    .filter((movie) => !isStarterMovie(movie));

  if (!legacyMovies.length) {
    return;
  }

  const alreadyAskedKey = `filmshelf_import_asked_${session.user.id}`;
  const alreadyAsked = localStorage.getItem(alreadyAskedKey);

  if (alreadyAsked === "yes") {
    return;
  }

  const confirmed = window.confirm(
    `I found ${legacyMovies.length} old saved movie(s) on this device. Import them to your cloud shelf?`
  );

  localStorage.setItem(alreadyAskedKey, "yes");

  if (!confirmed) {
    return;
  }

  try {
    for (const movie of legacyMovies) {
      await createMovieInCloud(prepareMovieForCloud(movie));
    }

    movies = await fetchMoviesFromCloud();
    render();

    alert("Old shelf imported successfully.");
  } catch (error) {
    console.error(error);
    alert("Could not import old shelf. Please try again.");
  }
}

function createAuthPanel() {
  let authPanel = document.getElementById("authPanel");

  if (authPanel) {
    return authPanel;
  }

  authPanel = document.createElement("section");
  authPanel.id = "authPanel";
  authPanel.style.margin = "18px 0 12px";
  authPanel.style.padding = "18px";
  authPanel.style.borderRadius = "24px";
  authPanel.style.background = "rgba(255, 255, 255, 0.78)";
  authPanel.style.border = "1px solid rgba(20, 18, 23, 0.10)";
  authPanel.style.boxShadow = "0 14px 34px rgba(31, 24, 55, 0.08)";

  const controls = document.querySelector(".controls");
  controls.parentNode.insertBefore(authPanel, controls);

  return authPanel;
}

function renderAuthState() {
  const authPanel = createAuthPanel();

  if (!session) {
    authPanel.innerHTML = `
      <div style="display:grid; gap:12px;">
        <div>
          <strong style="display:block; color:#141217; font-size:16px;">Sign in to sync your shelf</strong>
          <span style="display:block; color:#777180; font-size:13px; margin-top:4px;">
            Enter your email and open the magic link.
          </span>
        </div>

        <div style="display:grid; grid-template-columns:1fr auto; gap:10px;">
          <input id="authEmailInput" type="email" placeholder="your@email.com"
            style="min-width:0; padding:13px 14px; border-radius:14px; border:1px solid rgba(20,18,23,.14); background:rgba(255,255,255,.9);">
          <button id="authEmailButton" type="button"
            style="padding:13px 18px; border-radius:999px; border:0; background:#7c6cf2; color:#fff; font-weight:800; cursor:pointer;">
            Send link
          </button>
        </div>

        <div id="authMessage" style="color:#777180; font-size:13px;"></div>
      </div>
    `;

    const emailInput = document.getElementById("authEmailInput");
    const emailButton = document.getElementById("authEmailButton");
    const authMessage = document.getElementById("authMessage");

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
        authMessage.textContent = "Magic link sent. Open it from your email on this device.";
      } catch (error) {
        console.error(error);
        authMessage.textContent = "Could not send magic link. Check Supabase Auth settings.";
      } finally {
        emailButton.disabled = false;
        emailButton.textContent = "Send link";
      }
    };

    return;
  }

  const email = session.user?.email || "Signed in";

  authPanel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
      <div>
        <strong style="display:block; color:#141217; font-size:16px;">Cloud sync is on</strong>
        <span style="display:block; color:#777180; font-size:13px; margin-top:4px;">${escapeHTML(email)}</span>
      </div>

      <button id="signOutButton" type="button"
        style="padding:11px 16px; border-radius:999px; border:1px solid rgba(20,18,23,.14); background:rgba(255,255,255,.9); color:#201d27; font-weight:800; cursor:pointer;">
        Sign out
      </button>
    </div>
  `;

  document.getElementById("signOutButton").onclick = signOut;
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
    shelfEl.innerHTML = `<div class="empty">Sign in to see your shelf</div>`;
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
    } else {
      const newMovie = await createMovieInCloud({
        ...moviePayload,
        status: activeView === "watched" ? "watched" : "watchlist"
      });

      movies.unshift(newMovie);
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

async function initApp() {
  initLists();

  supabase = await loadSupabaseClient();
  await refreshSession();

  supabase.auth.onAuthStateChange(async (_event, newSession) => {
    session = newSession;
    renderAuthState();

    if (session) {
      await loadCloudShelf();
      await offerLegacyImportIfNeeded();
    } else {
      movies = [];
      render();
    }
  });

  renderAuthState();

  if (session) {
    await loadCloudShelf();
    await offerLegacyImportIfNeeded();
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
