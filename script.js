const COUNTRIES_URL = "https://api.restcountries.com/countries/v5";
const WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";

const app = document.getElementById("app");
const input = document.getElementById("search");
const results = document.getElementById("results");

let countries = [];
let timer;
let renderId = 0; // evita que una respuesta vieja pise una nueva

// ---------- Cargar países (con paginación) ----------
const CACHE_KEY = "countries-cache-v1";

async function fetchPage(offset, intento = 1) {
  try {
    const res = await fetch(`${COUNTRIES_URL}?limit=100&offset=${offset}`, {
      headers: { Authorization: `Bearer ${CONFIG.COUNTRIES_API_KEY}` },
    });
    if (!res.ok) throw new Error("Error " + res.status);
    return (await res.json()).data.objects;
  } catch (err) {
    if (intento >= 3) throw err;
    await new Promise((r) => setTimeout(r, 1000 * intento)); // espera y reintenta
    return fetchPage(offset, intento + 1);
  }
}

async function loadCountries() {
  const saved = localStorage.getItem(CACHE_KEY);
  if (saved) { countries = JSON.parse(saved); return; }

  const all = [];
  let offset = 0;
  for (let i = 0; i < 30; i++) {
    const batch = await fetchPage(offset);
    if (batch.length === 0) break;
    all.push(...batch);
    offset += batch.length;
  }

  countries = all
    .map((c) => ({
      names: { common: c.names.common },
      flag: { url_svg: c.flag?.url_svg, url_png: c.flag?.url_png },
      capitals: c.capitals,
      region: c.region,
      subregion: c.subregion,
      population: c.population,
      timezones: c.timezones,
    }))
    .filter((c) => c.flag.url_svg || c.flag.url_png); // descarta los que no tienen bandera

  localStorage.setItem(CACHE_KEY, JSON.stringify(countries));
}

// ---------- Utilidades ----------
const normalize = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const getName = (c) => c.names.common;
const getFlag = (c) => c.flag.url_svg || c.flag.url_png;

function getCapital(c) {
  const cap = c.capital ?? c.capitals;
  const first = Array.isArray(cap) ? cap[0] : cap;
  return (typeof first === "object" ? first?.name : first) || "Sin capital";
}

// ---------- Clima ----------
async function getWeather(city) {
  const url = `${WEATHER_URL}?q=${encodeURIComponent(city)}&appid=${CONFIG.WEATHER_API_KEY}&units=metric&lang=es`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Sin clima");
  return res.json();
}

// ---------- Pintar ----------
function showCards(list) {
  results.innerHTML = `<div class="grid">${list.map((c) => `
    <article class="card" data-name="${getName(c)}">
      <img src="${getFlag(c)}" alt="Bandera de ${getName(c)}">
      <h2>${getName(c)}</h2>
    </article>`).join("")}</div>`;
}

async function showDetail(c) {
  const id = ++renderId;
  results.innerHTML = `
    <article class="detail">
      <div class="flag">
        <img src="${getFlag(c)}" alt="Bandera de ${getName(c)}">
        <div class="weather" id="weather">Cargando clima…</div>
      </div>
      <div class="info">
        <h2>${getName(c)}</h2>
        <p>🏛️ ${getCapital(c)}</p>
        <p>👥 ${c.population?.toLocaleString("es-VE")} habitantes</p>
        <p>🌎 ${c.region ?? ""}</p>
        <p>📍 ${c.subregion ?? ""}</p>
        <p>🕐 ${c.timezones?.[0] ?? ""}</p>
      </div>
    </article>`;
  try {
    const w = await getWeather(getCapital(c));
    if (id !== renderId) return; // el usuario ya buscó otra cosa
    document.getElementById("weather").innerHTML = `
      <img src="https://openweathermap.org/img/wn/${w.weather[0].icon}@2x.png" alt="">
      <span>${w.weather[0].description} | ${w.main.temp.toFixed(1)} °C</span>`;
  } catch {
    if (id === renderId) document.getElementById("weather").textContent = "Clima no disponible";
  }
}

// ---------- Filtrar ----------
function render() {
  const text = normalize(input.value);
  renderId++;
  app.classList.toggle("home", text === "");
  if (text === "") return;

  const matches = countries.filter((c) => normalize(getName(c)).includes(text));
  const exact = matches.find((c) => normalize(getName(c)) === text);

  if (matches.length === 0) results.innerHTML = `<p class="message">No se encontró ningún país</p>`;
  else if (exact || matches.length === 1) showDetail(exact || matches[0]);
  else if (matches.length > 10) results.innerHTML = `<p class="message">Demasiados países, especifica mejor tu búsqueda</p>`;
  else showCards(matches);
}

input.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(render, 250); // debounce
});

results.addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (card) { input.value = card.dataset.name; render(); }
});

loadCountries().catch((err) => {
  console.error(err);
  app.classList.remove("home");
  results.innerHTML = `<p class="message">Error: ${err.message}</p>`;
});
