// Bouton « Envoyer à Bricky » (favori / bookmarklet).
//
// Le favori s'exécute sur la page d'annonce, dans le navigateur de
// l'utilisateur : il lit donc les sites qui bloquent les robots (Leboncoin,
// PAP, SeLoger…). Il ouvre Bricky dans un nouvel onglet avec le texte de
// l'annonce dans le fragment d'URL (#bricky-import=…). Le fragment n'est jamais
// envoyé à un serveur ; la page /analyze le lit, le met de côté en
// sessionStorage (pour survivre à une redirection vers /login), puis l'efface
// de la barre d'adresse.

export const IMPORT_HASH_KEY = "bricky-import";
export const IMPORT_STORAGE_KEY = "bricky_pending_import_v1";
const MAX_TEXT_CHARS = 30_000;

export type PendingImport = { url: string; text: string };

/** Code du favori, pour l'instance Bricky servie depuis `origin`. */
export function buildBookmarklet(origin: string): string {
  const source = `(function(){try{
if(location.origin===${JSON.stringify(origin)}){alert("Ouvre d'abord une annonce immobilière, puis clique sur le bouton Bricky.");return;}
var m=document.querySelector("main,article,[role=main]");
var root=(m&&m.innerText&&m.innerText.length>500)?m:document.body;
var ld=[].map.call(document.querySelectorAll('script[type="application/ld+json"]'),function(s){return s.textContent||"";}).join("\\n").slice(0,8000);
var txt=(document.title+"\\n"+ld+"\\n"+root.innerText).replace(/[ \\t]+/g," ").replace(/\\n\\s*\\n+/g,"\\n").slice(0,${MAX_TEXT_CHARS});
if(txt.length<200){alert("Bricky : cette page ne contient pas assez de texte. Attends qu'elle soit chargée, puis réessaie.");return;}
var data=encodeURIComponent(JSON.stringify({u:location.href,t:txt}));
var w=window.open(${JSON.stringify(origin + "/analyze#" + IMPORT_HASH_KEY + "=")}+data,"_blank");
if(!w){alert("Bricky : autorise les fenêtres pop-up pour ce site, puis réessaie.");}
}catch(e){alert("Bricky : impossible de lire cette page.");}})();`;
  return "javascript:" + source.replace(/\n/g, "");
}

/**
 * Récupère une annonce envoyée par le favori : d'abord dans l'URL (puis on
 * l'efface de la barre d'adresse), sinon dans sessionStorage.
 */
export function takePendingImportFromLocation(): PendingImport | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  const match = window.location.hash.match(new RegExp(`${IMPORT_HASH_KEY}=([^&]+)`));
  if (match) {
    try {
      raw = decodeURIComponent(match[1]);
    } catch {
      raw = null;
    }
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (raw) {
      try {
        window.sessionStorage.setItem(IMPORT_STORAGE_KEY, raw);
      } catch {}
    }
  } else {
    try {
      raw = window.sessionStorage.getItem(IMPORT_STORAGE_KEY);
    } catch {
      raw = null;
    }
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { u?: unknown; t?: unknown };
    const text = typeof parsed.t === "string" ? parsed.t : "";
    const url = typeof parsed.u === "string" && /^https?:\/\//.test(parsed.u) ? parsed.u : "";
    if (text.length < 50) return null;
    return { url, text: text.slice(0, MAX_TEXT_CHARS) };
  } catch {
    return null;
  }
}

export function hasPendingImport(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.hash.includes(`${IMPORT_HASH_KEY}=`)) return true;
  try {
    return Boolean(window.sessionStorage.getItem(IMPORT_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function clearPendingImport() {
  try {
    window.sessionStorage.removeItem(IMPORT_STORAGE_KEY);
  } catch {}
}
