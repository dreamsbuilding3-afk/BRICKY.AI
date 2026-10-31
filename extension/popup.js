// Bricky – Envoyer une annonce
// Lit la page ouverte (texte + données structurées), prend éventuellement une
// capture de l'écran, puis ouvre Bricky avec ces données dans le fragment
// d'URL (#bricky-import=…). Le fragment n'est jamais envoyé à un serveur :
// c'est la page Bricky, une fois connectée, qui lit l'annonce.

const DEFAULT_ORIGIN = "https://bricky-ai-three.vercel.app";
const MAX_TEXT_CHARS = 30000;
const MAX_SHOT_CHARS = 1200000;

const $ = (id) => document.getElementById(id);

function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}

async function getOrigin() {
  try {
    const { origin } = await chrome.storage.sync.get("origin");
    return typeof origin === "string" && origin ? origin : DEFAULT_ORIGIN;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

function normalizeOrigin(value) {
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "https:" && u.hostname !== "localhost") return null;
    return u.origin;
  } catch {
    return null;
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Exécutée dans la page de l'annonce : doit rester autonome (aucune variable extérieure).
function readListingPage(maxChars) {
  const main = document.querySelector("main,article,[role=main]");
  const root = main && main.innerText && main.innerText.length > 500 ? main : document.body;
  const ld = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .map((s) => s.textContent || "")
    .join("\n")
    .slice(0, 8000);
  const text = (document.title + "\n" + ld + "\n" + (root ? root.innerText : ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .slice(0, maxChars);
  return { u: location.href, t: text };
}

// Capture de la partie visible, réduite à 1400 px de large (JPEG).
async function captureScreen(windowId) {
  const raw = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 80 });
  const img = await createImageBitmap(await (await fetch(raw)).blob());
  const scale = Math.min(1, 1400 / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.72, 0.55, 0.4]) {
    const data = canvas.toDataURL("image/jpeg", quality);
    if (data.length < MAX_SHOT_CHARS) return data;
  }
  return null;
}

async function send() {
  const button = $("send");
  button.disabled = true;
  setStatus("Lecture de l'annonce…");
  try {
    const tab = await activeTab();
    const origin = await getOrigin();
    if (!tab || !tab.id || !/^https?:/.test(tab.url || "")) {
      throw new Error("Ouvre une annonce immobilière dans cet onglet, puis réessaie.");
    }
    if ((tab.url || "").startsWith(origin)) {
      throw new Error("Tu es déjà sur Bricky : ouvre d'abord une annonce (Leboncoin, SeLoger, PAP…).");
    }

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readListingPage,
      args: [MAX_TEXT_CHARS],
    });
    const page = injection && injection.result;
    if (!page || !page.t || page.t.length < 200) {
      throw new Error("Cette page ne contient pas assez de texte. Attends qu'elle soit chargée, puis réessaie.");
    }

    const payload = { u: page.u, t: page.t };
    if ($("withShot").checked) {
      setStatus("Capture de la page…");
      try {
        const shot = await captureScreen(tab.windowId);
        if (shot) payload.s = shot;
      } catch {
        // Capture impossible (page protégée) : le texte suffit.
      }
    }

    const target = origin + "/analyze#bricky-import=" + encodeURIComponent(JSON.stringify(payload));
    await chrome.tabs.create({ url: target, index: tab.index + 1, openerTabId: tab.id });
    setStatus("Annonce envoyée ✓", "ok");
    setTimeout(() => window.close(), 400);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    setStatus(
      /Cannot access|cannot be scripted|chrome:\/\/|extensions gallery/i.test(message)
        ? "Chrome ne permet pas de lire cette page. Ouvre une annonce sur un site immobilier."
        : message,
      "err",
    );
    button.disabled = false;
  }
}

async function init() {
  const tab = await activeTab().catch(() => null);
  if (tab) {
    $("pageTitle").textContent = (tab.title || "Page sans titre").trim();
    try {
      $("pageDomain").textContent = new URL(tab.url).hostname.replace(/^www\./, "");
    } catch {
      $("pageDomain").textContent = "";
    }
  }
  const origin = await getOrigin();
  $("origin").value = origin;

  $("send").addEventListener("click", send);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement !== $("origin") && !$("send").disabled) send();
  });

  $("saveOrigin").addEventListener("click", async () => {
    const value = normalizeOrigin($("origin").value);
    if (!value) return setStatus("Adresse invalide (elle doit commencer par https://).", "err");
    await chrome.storage.sync.set({ origin: value });
    $("origin").value = value;
    setStatus("Adresse enregistrée ✓", "ok");
  });
  $("resetOrigin").addEventListener("click", async () => {
    await chrome.storage.sync.remove("origin");
    $("origin").value = DEFAULT_ORIGIN;
    setStatus("Adresse par défaut rétablie ✓", "ok");
  });

  $("send").focus();
}

init();
