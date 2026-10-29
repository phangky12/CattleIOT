
/*
 * Live data: registered cattle and RFID scan history.
 * Feeding, drinking, and ML metrics remain illustrative
 * until actual measurements or predictions are available.
 */

const REFRESH_INTERVAL = 5000;

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function formatTime(value) {
    if (!value) return "Not scanned yet";

    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "Unknown"
        : date.toLocaleString();
}

function addCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value ?? "—";
    row.appendChild(cell);
}

function renderCattle(animals, scans) {
    const tableBody = document.getElementById("cattleTableBody");
    if (!tableBody) return;

    tableBody.replaceChildren();

    const lastSeenByUid = new Map();

    scans.forEach(scan => {
        if (!lastSeenByUid.has(scan.tag_uid)) {
            lastSeenByUid.set(scan.tag_uid, scan.scanned_at);
        }
    });

    animals.forEach(animal => {
        const row = document.createElement("tr");
        const uid = animal.tag_uid;
        const lastSeen = animal.last_seen || lastSeenByUid.get(uid);

        addCell(
            row,
            animal.animal_name ||
            `CATTLE-${String(animal.animal_id).padStart(3, "0")}`
        );

        addCell(row, uid);
        addCell(row, lastSeen ? formatTime(lastSeen) : "Not scanned yet");

        // These are not measured by the RFID reader.
        addCell(row, "—");
        addCell(row, "—");

        const statusCell = document.createElement("td");
        const badge = document.createElement("span");

        badge.className = "badge " + (lastSeen ? "normal" : "abnormal");
        badge.textContent = lastSeen ? "RFID detected" : "No scan yet";

        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        tableBody.appendChild(row);
    });

    if (animals.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 6;
        cell.textContent = "No registered cattle yet.";
        row.appendChild(cell);
        tableBody.appendChild(row);
    }
}

function renderActivity(scans) {
    const activity = document.querySelector(".activity-card .activity");
    if (!activity) return;

    activity.replaceChildren();

    if (scans.length === 0) {
        const message = document.createElement("p");
        message.textContent = "No RFID scans recorded yet.";
        activity.appendChild(message);
        return;
    }

    scans.slice(0, 5).forEach(scan => {
        const item = document.createElement("div");
        item.className = "activity-item";

        const icon = document.createElement("span");
        icon.className = "activity-icon feed";
        icon.innerHTML = '<i class="bi bi-upc-scan"></i>';

        const details = document.createElement("div");

        const title = document.createElement("strong");
        title.textContent = scan.animal_name ||
            (scan.animal_id
                ? `CATTLE-${String(scan.animal_id).padStart(3, "0")}`
                : "Unregistered tag");

        const description = document.createElement("p");
        description.textContent = `RFID tag ${scan.tag_uid} detected`;

        details.append(title, description);

        const time = document.createElement("small");
        time.textContent = formatTime(scan.scanned_at);

        item.append(icon, details, time);
        activity.appendChild(item);
    });
}

async function refreshDashboard() {
    try {
        const [animalsResponse, scansResponse] = await Promise.all([
            fetch("/api/dashboard/animals", { cache: "no-store" }),
            fetch("/api/dashboard/scans", { cache: "no-store" })
        ]);

        if (!animalsResponse.ok || !scansResponse.ok) {
            throw new Error("The dashboard API returned an error.");
        }

        const animals = await animalsResponse.json();
        const scans = await scansResponse.json();

        setText("totalCattle", animals.length);

        // RFID alone does not measure these metrics.
        setText("avgFeeding", "Not measured");
        setText("avgDrinking", "Not measured");
        setText("totalAnomalies", "Not available");

        renderCattle(animals, scans);
        renderActivity(scans);

        showChartPlaceholder("feedChart", "Feeding data not available");
        showChartPlaceholder("waterChart", "Drinking data not available");
        showChartPlaceholder("frequencyChart", "Event data not available");
        showChartPlaceholder("behaviourChart", "Behaviour predictions not available");

        const status = document.querySelector(".system-status");
        if (status) {
            status.textContent = "Data connected";
        }

    } catch (error) {
        console.error("Dashboard refresh failed:", error);

        const status = document.querySelector(".system-status");
        if (status) {
            status.textContent = "Data connection error";
        }
    }
}

// Sidebar navigation
const navLinks = document.querySelectorAll(".sidebar .nav-link");
const pageTitle = document.getElementById("pageTitle");

const summarySection = document.getElementById("summarySection");
const chartsSection = document.getElementById("chartsSection");
const cattleSection = document.getElementById("cattleSection");
const bottomSection = document.getElementById("bottomSection");

const chartCards = document.querySelectorAll(".chart-card");
const activityCard = document.querySelector(".activity-card");
const anomalyCard = document.querySelector(".anomaly-card");

function showPage(page) {
    summarySection.style.display = "none";
    chartsSection.style.display = "none";
    cattleSection.style.display = "none";
    bottomSection.style.display = "none";

    chartCards.forEach(card => card.style.display = "block");

    if (activityCard) activityCard.style.display = "block";
    if (anomalyCard) anomalyCard.style.display = "block";

    switch (page) {
        case "dashboard":
            pageTitle.textContent = "Dashboard";
            summarySection.style.display = "grid";
            chartsSection.style.display = "grid";
            cattleSection.style.display = "block";
            bottomSection.style.display = "grid";
            break;

        case "cattle":
            pageTitle.textContent = "Cattle Monitoring";
            cattleSection.style.display = "block";
            break;

        case "feeding":
            pageTitle.textContent = "Feeding Monitoring";
            chartsSection.style.display = "grid";
            chartCards.forEach((card, index) => {
                if (index !== 0 && index !== 2) {
                    card.style.display = "none";
                }
            });
            break;

        case "water":
            pageTitle.textContent = "Drinking Monitoring";
            chartsSection.style.display = "grid";
            chartCards.forEach((card, index) => {
                if (index !== 1 && index !== 2) {
                    card.style.display = "none";
                }
            });
            break;

        case "analytics":
            pageTitle.textContent = "Behaviour Analytics";
            chartsSection.style.display = "grid";
            break;

        case "anomalies":
            pageTitle.textContent = "Anomaly Detection";
            bottomSection.style.display = "grid";
            if (activityCard) activityCard.style.display = "none";
            break;

        default:
            pageTitle.textContent = "Dashboard";
            summarySection.style.display = "grid";
            chartsSection.style.display = "grid";
            cattleSection.style.display = "block";
            bottomSection.style.display = "grid";
    }

    navLinks.forEach(link => {
        link.classList.toggle("active", link.dataset.page === page);
    });

    if (typeof Chart !== "undefined") {
        ["feedChart", "waterChart", "frequencyChart", "behaviourChart"]
            .forEach(id => Chart.getChart(id)?.resize());
    }
}

navLinks.forEach(link => {
    link.addEventListener("click", event => {
        event.preventDefault();
        const page = link.dataset.page;
        window.location.hash = page;
        showPage(page);
    });
});

function loadCurrentPage() {
    showPage(window.location.hash.slice(1) || "dashboard");
}

window.addEventListener("hashchange", loadCurrentPage);

loadCurrentPage();
refreshDashboard();
setInterval(refreshDashboard, REFRESH_INTERVAL);


/*
 * Show a clear placeholder until real measurements are available.
 * RFID scans alone cannot measure feeding or drinking duration.
 */

function showChartPlaceholder(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Prevent any old illustrative chart from being displayed.
    const existingChart =
        typeof Chart !== "undefined" ? Chart.getChart(canvas) : null;

    if (existingChart) {
        existingChart.destroy();
    }

    canvas.style.display = "none";

    let placeholder = canvas.parentElement.querySelector(
        `[data-chart-placeholder="${canvasId}"]`
    );

    if (!placeholder) {
        placeholder = document.createElement("div");
        placeholder.dataset.chartPlaceholder = canvasId;
        placeholder.style.minHeight = "220px";
        placeholder.style.display = "flex";
        placeholder.style.flexDirection = "column";
        placeholder.style.alignItems = "center";
        placeholder.style.justifyContent = "center";
        placeholder.style.gap = "8px";
        placeholder.style.color = "#718096";
        placeholder.style.textAlign = "center";
        placeholder.style.padding = "20px";

        canvas.insertAdjacentElement("afterend", placeholder);
    }

    placeholder.replaceChildren();

    const title = document.createElement("strong");
    title.textContent = message;
    title.style.fontWeight = "500";

    const detail = document.createElement("span");
    detail.textContent =
        "This chart will update when real monitoring data is available.";
    detail.style.fontSize = "13px";

    placeholder.append(title, detail);
}
