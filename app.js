const services = [
  { id: "coupe-femme", name: "Coupe femme", duration: 45, price: 42, pole: "Coupe & Brushing" },
  { id: "coupe-homme", name: "Coupe homme", duration: 30, price: 28, pole: "Coupe & Brushing" },
  { id: "brushing", name: "Brushing", duration: 30, price: 25, pole: "Coupe & Brushing" },
  { id: "couleur-racine", name: "Couleur racine", duration: 75, price: 55, pole: "Couleur & Technique", premium: true },
  { id: "balayage", name: "Balayage", duration: 150, price: 95, pole: "Couleur & Technique", premium: true },
  { id: "coupe-barbe", name: "Coupe barbe", duration: 20, price: 18, pole: "Barbier" },
  { id: "coupe-barbe-complete", name: "Coupe + barbe", duration: 45, price: 40, pole: "Barbier" }
];

const professionals = [
  { id: "anais", name: "Anaïs Martin", role: "Coiffeuse coupe & brushing", poles: ["Coupe & Brushing"] },
  { id: "jade", name: "Jade Laurent", role: "Coiffeuse coupe & brushing", poles: ["Coupe & Brushing"] },
  { id: "lina", name: "Lina Bernard", role: "Coloriste", poles: ["Couleur & Technique"] },
  { id: "sarah", name: "Sarah Petit", role: "Coloriste", poles: ["Couleur & Technique"] },
  { id: "karim", name: "Karim Moreau", role: "Barbier", poles: ["Barbier"] }
];

const state = {
  service: null,
  professional: "any",
  date: null,
  time: null,
  reservations: [],
  filter: "all"
};

const serviceGrid = document.querySelector("#serviceGrid");
const professionalGrid = document.querySelector("#professionalGrid");
const dateInput = document.querySelector("#dateInput");
const slotsContainer = document.querySelector("#slots");
const bookingForm = document.querySelector("#bookingForm");
const formError = document.querySelector("#formError");
const submitButton = document.querySelector("#submitButton");

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function durationLabel(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest}` : `${hours} h`;
}

function renderServices() {
  serviceGrid.innerHTML = services
    .map(
      (service) => `
        <button
          class="service-option${state.service?.id === service.id ? " selected" : ""}"
          type="button"
          data-service="${service.id}"
          aria-pressed="${state.service?.id === service.id}"
        >
          <span>
            <span class="service-name">${service.name}</span>
            <span class="service-meta">${durationLabel(service.duration)} · ${service.pole}</span>
          </span>
          <span class="service-price">${service.price} €</span>
        </button>
      `
    )
    .join("");
}

function renderProfessionals() {
  let options = [{ id: "any", name: "Peu importe", role: "Professionnel disponible" }, ...professionals];

  if (state.service) {
    options = [
      { id: "any", name: "Peu importe", role: "Professionnel qualifié disponible" },
      ...professionals.filter((professional) => professional.poles.includes(state.service.pole))
    ];
  }

  if (state.professional !== "any" && !options.some((option) => option.id === state.professional)) {
    state.professional = "any";
  }

  professionalGrid.innerHTML = options
    .map(
      (professional) => `
        <button
          class="professional-option${state.professional === professional.id ? " selected" : ""}"
          type="button"
          data-professional="${professional.id}"
          aria-pressed="${state.professional === professional.id}"
        >
          <strong>${professional.name}</strong>
          <span>${professional.role}</span>
        </button>
      `
    )
    .join("");
}

function getQualifiedProfessionals(service) {
  if (!service) return professionals;
  return professionals.filter((professional) => professional.poles.includes(service.pole));
}

function getAvailableSlots() {
  if (!state.service || !state.date) return [];

  const slots = [];
  for (let hour = 9; hour <= 18; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === 18 && minute === 30) continue;
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }

  return slots.filter((time) => {
    const qualified = state.professional === "any"
      ? getQualifiedProfessionals(state.service)
      : professionals.filter((professional) => professional.id === state.professional);

    return qualified.some((professional) => isSlotAvailable(state.date, time, professional, state.service));
  });
}

function isSlotAvailable(date, time, professional, service) {
  const [hours, minutes] = time.split(":").map(Number);
  const start = new Date(`${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
  const end = new Date(start.getTime() + service.duration * 60000);

  return !state.reservations.some((reservation) => {
    if (reservation.professionalId !== professional.id) return false;
    if (reservation.date !== date) return false;
    const [reservedHours, reservedMinutes] = reservation.time.split(":").map(Number);
    const reservedStart = new Date(`${date}T${String(reservedHours).padStart(2, "0")}:${String(reservedMinutes).padStart(2, "0")}:00`);
    const reservedService = services.find((item) => item.id === reservation.serviceId);
    const reservedEnd = new Date(reservedStart.getTime() + reservedService.duration * 60000);
    return start < reservedEnd && end > reservedStart;
  });
}

function renderSlots() {
  if (!state.service || !state.date) {
    slotsContainer.innerHTML = '<p class="service-meta">Choisissez une prestation et une date.</p>';
    return;
  }

  const available = getAvailableSlots();
  slotsContainer.innerHTML = [
    "09:00",
    "09:30",
    "10:00",
    "10:30",
    "11:00",
    "11:30",
    "14:00",
    "14:30",
    "15:00",
    "15:30",
    "16:00",
    "16:30"
  ].map((time) =>
    `<button class="slot${state.time === time ? " selected" : ""}" type="button" data-slot="${time}"${available.includes(time) ? "" : " disabled"}>${time}</button>`
  ).join("");

  if (!available.includes(state.time)) state.time = null;
}

function validatePhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 10;
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function switchView(viewName) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll(".view-button").forEach((button) => button.classList.remove("active"));
  document.querySelector(`#${viewName}View`).classList.add("active");
  document.querySelector(`[data-view="${viewName}"]`).classList.add("active");
  if (viewName === "manager") renderReservations();
}

function showToast(title, message) {
  const toast = document.querySelector("#toast");
  document.querySelector("#toastTitle").textContent = title;
  document.querySelector("#toastMessage").textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("visible"), 4200);
}

async function createReservation(event) {
  event.preventDefault();
  if (submitButton.disabled) return;
  formError.textContent = "";

  const name = document.querySelector("#nameInput").value.trim();
  const phone = document.querySelector("#phoneInput").value.trim();
  const email = document.querySelector("#emailInput").value.trim();

  if (!state.service) return setError("Veuillez choisir une prestation.");
  if (!state.date) return setError("Veuillez choisir une date.");
  if (!state.time) return setError("Veuillez choisir un horaire disponible.");
  if (name.length < 2) return setError("Veuillez renseigner votre prénom et votre nom.");
  if (!validatePhone(phone)) return setError("Veuillez renseigner un numéro de téléphone à 10 chiffres.");
  if (!validateEmail(email)) return setError("Veuillez renseigner une adresse e-mail valide.");

  let professional = professionals.find((item) => item.id === state.professional);
  if (!professional) {
    professional = getQualifiedProfessionals(state.service).find((item) =>
      isSlotAvailable(state.date, state.time, item, state.service)
    );
  }

  if (!professional || !isSlotAvailable(state.date, state.time, professional, state.service)) {
    renderSlots();
    return setError("Ce créneau vient d'être réservé. Veuillez en choisir un autre.");
  }

  const dateHeure = `${state.date}T${state.time}:00`;
  const payload = {
    prestation: state.service.name,
    duree: state.service.duration,
    prix: state.service.price,
    coiffeur: state.professional === "any" ? "Sans préférence" : professional.name,
    dateHeure,
    nom: name,
    telephone: phone,
    email
  };

  submitButton.disabled = true;
  submitButton.dataset.label = submitButton.textContent.trim();
  submitButton.textContent = "Envoi en cours…";

  try {
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(result?.message || "La réservation n’a pas pu être transmise. Réessayez.");
    }

    if (result?.status === "confirmed" && typeof result.reference === "string" && result.reference.trim()) {
      state.reservations.push({
        id: result.reference,
        serviceId: state.service.id,
        professionalId: professional.id,
        date: state.date,
        time: state.time,
        name,
        phone,
        email,
        status: "Confirmé"
      });
      updateReservationCount();
      renderReservations();
      showToast("Rendez-vous confirmé", `${state.time} — ${professional.name} vous attend au salon.`);
    } else if (result?.status === "received") {
      showToast("Demande transmise", "Le salon a bien reçu votre demande.");
    } else {
      throw new Error("La réponse du serveur est invalide. Réessayez.");
    }

    bookingForm.reset();
    state.service = null;
    state.professional = "any";
    state.date = minimumDate;
    state.time = null;
    dateInput.value = minimumDate;
    renderServices();
    renderProfessionals();
    renderSlots();
  } catch (error) {
    setError(`${error.message} Vos informations sont conservées.`);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = submitButton.dataset.label;
  }
}

function setError(message) {
  formError.textContent = message;
  formError.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderReservations() {
  const today = toDateInputValue(new Date());
  const rows = state.reservations
    .filter((reservation) => {
      if (state.filter === "today") return reservation.date === today;
      if (state.filter === "upcoming") return reservation.date > today;
      return true;
    })
    .sort((first, second) => `${first.date}${first.time}`.localeCompare(`${second.date}${second.time}`));

  document.querySelector("#allCount").textContent = state.reservations.length;
  document.querySelector("#reservationCount").textContent = state.reservations.length;

  const container = document.querySelector("#reservationRows");
  if (!rows.length) {
    container.innerHTML = '<div class="empty-state"><p>Aucune réservation pour ce filtre.</p></div>';
    return;
  }

  container.innerHTML = rows
    .map((reservation) => {
      const service = services.find((item) => item.id === reservation.serviceId);
      const professional = professionals.find((item) => item.id === reservation.professionalId);
      const date = new Date(`${reservation.date}T12:00:00`);
      const dateLabel = new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short"
      }).format(date);

      return `
        <div class="table-row" role="row">
          <span class="time-cell" role="cell">${reservation.time}<br><small>${dateLabel}</small></span>
          <span class="client-cell" role="cell">
            <strong>${escapeHtml(reservation.name)}</strong>
            <span>${escapeHtml(reservation.phone)}</span>
          </span>
          <span role="cell">${service.name}<br><small>${durationLabel(service.duration)} · ${service.price} €</small></span>
          <span role="cell">${professional.name}</span>
          <span class="status" role="cell">${reservation.status}</span>
        </div>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function updateReservationCount() {
  document.querySelector("#reservationCount").textContent = state.reservations.length;
  document.querySelector("#allCount").textContent = state.reservations.length;
}

const today = new Date();
const minimumDate = toDateInputValue(today);
dateInput.min = minimumDate;
dateInput.value = minimumDate;
state.date = minimumDate;

document.querySelector("#todayLabel").textContent =
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(today);

renderServices();
renderProfessionals();
renderSlots();
renderReservations();

serviceGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-service]");
  if (!button) return;
  state.service = services.find((service) => service.id === button.dataset.service);
  state.time = null;
  renderServices();
  renderProfessionals();
  renderSlots();
});

professionalGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-professional]");
  if (!button) return;
  state.professional = button.dataset.professional;
  state.time = null;
  renderProfessionals();
  renderSlots();
});

dateInput.addEventListener("change", () => {
  state.date = dateInput.value;
  state.time = null;
  renderSlots();
});

slotsContainer.addEventListener("click", (event) => {
  const button = event.target.closest("[data-slot]");
  if (!button || button.disabled) return;
  state.time = button.dataset.slot;
  renderSlots();
});

document.querySelectorAll(".view-button").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelectorAll(".filter-tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll(".filter-tab").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    renderReservations();
  });
});

document.querySelector("#newBookingButton").addEventListener("click", () => switchView("client"));
bookingForm.addEventListener("submit", createReservation);
