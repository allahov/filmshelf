const STORAGE_KEY = "filmshelf_movies_v3";

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

const starterMovies = [
  {
    id: 1,
    title: "La La Land",
    type: "movie",
    genre: "Romance",
    year: "2016",
    country: "USA",
    poster: "https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=600&auto=format&fit=crop",
    status: "watchlist"
  },
  {
    id: 2,
    title: "The Crown",
    type: "series",
    genre: "Drama",
    year: "2016",
    country: "UK",
    poster: "https://images.unsplash.com/photo-1518676590629-3dcbd9c5a5c9?q=80&w=600&auto=format&fit=crop",
    status: "watchlist"
  },
  {
    id: 3,
    title: "Amélie",
    type: "movie",
    genre: "Comedy",
    year: "2001",
    country: "France",
    poster: "",
    status: "watchlist"
  },
  {
    id: 4,
    title: "Only Murders in the Building",
    type: "series",
    genre: "Crime",
    year: "2021",
    country: "USA",
    poster: "",
    status: "watched"
  }
];

let movies = loadMovies();
let activeType = "all";
let activeGenre = "All";
let activeView = "watchlist";
let selectedPoster = "";
let editingId = null;

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

function loadMovies() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return starterMovies;
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : starterMovies;
  } catch {
    return starterMovies;
  }
}

function saveMovies() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(movies));
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

  const list = filteredMovies();
  shelfEl.innerHTML = "";

  if (!list.length) {
    shelfEl.innerHTML = `<div class="empty">Your shelf is empty</div>`;
  } else {
    list.forEach((movie) => shelfEl.appendChild(createFrame(movie)));
  }

  attachToggleEvents();
}

function attachToggleEvents() {
  document.querySelectorAll("[data-toggle]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();

      const id = Number(button.dataset.toggle);
      const frame = document.querySelector(`.frame[data-id="${id}"]`);

      if (frame) {
        frame.classList.add("watching-out");
      }

      setTimeout(() => {
        movies = movies.map((movie) => {
          if (movie.id !== id) return movie;

          return {
            ...movie,
            status: movie.status === "watchlist" ? "watched" : "watchlist"
          };
        });

        saveMovies();
        render();
      }, 560);
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

openModal.onclick = () => openAddModal();
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

saveMovie.onclick = () => {
  const title = titleInput.value.trim();

  if (!title) {
    titleInput.focus();
    return;
  }

  if (editingId) {
    movies = movies.map((movie) => {
      if (movie.id !== editingId) return movie;

      return {
        ...movie,
        title,
        poster: selectedPoster,
        type: typeInput.value,
        genre: genreInput.value || "",
        year: yearInput.value.trim(),
        country: countryInput.value.trim()
      };
    });
  } else {
    movies.unshift({
      id: Date.now(),
      title,
      poster: selectedPoster,
      type: typeInput.value,
      genre: genreInput.value || "",
      year: yearInput.value.trim(),
      country: countryInput.value.trim(),
      status: activeView === "watched" ? "watched" : "watchlist"
    });
  }

  saveMovies();
  resetForm();
  closeMovieModal();
  render();
};

deleteMovie.onclick = () => {
  if (!editingId) return;

  const movie = movies.find((item) => item.id === editingId);
  const title = movie?.title || "this card";
  const confirmed = window.confirm(`Delete "${title}" from your shelf?`);

  if (!confirmed) return;

  movies = movies.filter((movie) => movie.id !== editingId);

  saveMovies();
  resetForm();
  closeMovieModal();
  render();
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

initLists();
render();
