// Modèles des mails de relance, en FR / EN / 中文.
// Aucun service d'envoi n'est branché : ces fonctions renvoient { subject, text, html }
// prêtes à passer à n'importe quel fournisseur (Resend, Postmark, SMTP…).
//
// - quotaReached       : quota mensuel atteint → pousse vers Pro
// - lockedFeatureClick : un abonné Essentiel a cliqué sur une fonction Pro
// - freeAnalysisDone   : relance après l'analyse gratuite (Découverte) → Pro annuel

import type { Locale } from "../i18n/translations";

export type Email = { subject: string; text: string; html: string };

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bricky.ai";
const PRO_URL = `${BASE_URL}/checkout?plan=pro&periode=annuel`;

function eur(cents: number, locale: Locale) {
  const tag = locale === "en" ? "en-US" : locale === "zh" ? "zh-CN" : "fr-FR";
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString(tag, { style: "currency", currency: "EUR", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Mise en page commune : paragraphes + un bouton orange. */
function render(subject: string, paragraphs: string[], cta: { label: string; url: string }, footer: string): Email {
  const text = [...paragraphs, `${cta.label} : ${cta.url}`, "", footer].join("\n\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f7f5;font-family:Arial,Helvetica,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e7e7e4;border-radius:18px" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 28px 24px">
<p style="margin:0 0 18px;font-weight:800;font-size:18px;letter-spacing:-.02em">Bricky</p>
${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${escapeHtml(p)}</p>`).join("\n")}
<p style="margin:22px 0 6px"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#ff5a1f;color:#fff;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">${escapeHtml(cta.label)}</a></p>
</td></tr></table>
<p style="max-width:520px;margin:14px auto 0;color:#888;font-size:12px;line-height:1.5">${escapeHtml(footer)}</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}

type Prices = { currentMonthlyCents: number; proMonthlyCents?: number; quota?: number; proQuota?: number };

/** Quota mensuel atteint : le mail pousse vers Pro (5 € de plus, 5× plus d'analyses). */
export function quotaReached(locale: Locale, p: Prices): Email {
  const pro = p.proMonthlyCents ?? 3400;
  const quota = p.quota ?? 5;
  const proQuota = p.proQuota ?? 25;
  const delta = eur(Math.max(0, pro - p.currentMonthlyCents), locale);
  const perPro = eur(Math.round(pro / proQuota), locale);
  if (locale === "en") {
    return render(
      `You've used your ${quota} analyses this month`,
      [
        `You've analyzed ${quota} properties in the last 30 days: that's your full Essentiel quota.`,
        `With Pro, you get ${proQuota} analyses a month for just ${delta} more, which brings each analysis down to ${perPro}. You also unlock the suggested offer price, co-ownership minutes reading, property comparison, alerts and visit mode.`,
      ],
      { label: "Upgrade to Pro", url: PRO_URL },
      "Your previous analyses stay available. Your quota refills over a rolling 30 days.",
    );
  }
  if (locale === "zh") {
    return render(
      `您本月的 ${quota} 次分析已用完`,
      [
        `您在过去 30 天内已分析了 ${quota} 个房源,Essentiel 的配额已全部用完。`,
        `升级到 Pro,每月只需多付 ${delta},即可获得 ${proQuota} 次分析,每次分析仅 ${perPro}。同时解锁建议出价、业主大会纪要解读、房源对比、提醒和看房模式。`,
      ],
      { label: "升级到 Pro", url: PRO_URL },
      "已完成的分析仍可查看。配额按滚动 30 天恢复。",
    );
  }
  return render(
    `Vos ${quota} analyses du mois sont utilisées`,
    [
      `Vous avez analysé ${quota} biens ces 30 derniers jours : c'est tout le quota d'Essentiel.`,
      `Avec Pro, vous avez ${proQuota} analyses par mois pour seulement ${delta} de plus, soit ${perPro} l'analyse. Vous débloquez aussi le prix à proposer, la lecture des PV d'AG, le comparateur, les alertes et le mode visite.`,
    ],
    { label: "Passer à Pro", url: PRO_URL },
    "Vos analyses déjà faites restent consultables. Votre quota se recharge sur 30 jours glissants.",
  );
}

const FEATURE_NAMES: Record<string, Record<Locale, string>> = {
  can_suggest_offer: { fr: "le prix à proposer", en: "the suggested offer price", zh: "建议出价" },
  can_read_copro_minutes: { fr: "la lecture des PV d'AG", en: "co-ownership minutes reading", zh: "业主大会纪要解读" },
  can_upload_multi_documents: { fr: "le dossier multi-pièces", en: "multi-document files", zh: "多文件资料包" },
  can_compare_properties: { fr: "le comparateur", en: "property comparison", zh: "房源对比" },
  can_set_alerts: { fr: "les alertes", en: "alerts", zh: "提醒" },
  can_use_visit_mode: { fr: "le mode visite", en: "visit mode", zh: "看房模式" },
  can_download_full_pdf: { fr: "l'export PDF complet", en: "the full PDF export", zh: "完整 PDF 导出" },
};

/** Un abonné Essentiel a cliqué sur une fonction verrouillée (à envoyer une seule fois). */
export function lockedFeatureClick(locale: Locale, feature: keyof typeof FEATURE_NAMES, p: Prices): Email {
  const name = FEATURE_NAMES[feature]?.[locale] ?? FEATURE_NAMES.can_suggest_offer[locale];
  const delta = eur(Math.max(0, (p.proMonthlyCents ?? 3400) - p.currentMonthlyCents), locale);
  if (locale === "en") {
    return render(
      `${name[0].toUpperCase()}${name.slice(1)} is one click away`,
      [`You tried ${name} earlier. It's included in Pro, for ${delta} more a month, along with 25 analyses instead of 5.`],
      { label: "Upgrade to Pro", url: PRO_URL },
      "No commitment on monthly billing. Yearly billing gets you 2 months free.",
    );
  }
  if (locale === "zh") {
    return render(
      `${name},一步即可使用`,
      [`您刚才尝试使用${name}。该功能包含在 Pro 中,每月只需多付 ${delta},分析次数也从 5 次增加到 25 次。`],
      { label: "升级到 Pro", url: PRO_URL },
      "按月订阅无长期合约。按年订阅赠送 2 个月。",
    );
  }
  return render(
    `${name[0].toUpperCase()}${name.slice(1)}, c'est à un clic`,
    [`Vous avez essayé ${name} tout à l'heure. C'est inclus dans Pro, pour ${delta} de plus par mois, avec 25 analyses au lieu de 5.`],
    { label: "Passer à Pro", url: PRO_URL },
    "Sans engagement en mensuel. En annuel, 2 mois sont offerts.",
  );
}

/** Relance après l'analyse gratuite : met Pro annuel en avant. */
export function freeAnalysisDone(locale: Locale, p: { proYearlyCents?: number; proQuota?: number } = {}): Email {
  const yearly = p.proYearlyCents ?? 34000;
  const proQuota = p.proQuota ?? 25;
  const perMonth = eur(Math.round(yearly / 12), locale);
  if (locale === "en") {
    return render(
      "Your Bricky analysis is waiting for you",
      [
        "Your score and verdict are ready. The full detail (offer price, yield, risks, land registry) unlocks with a subscription.",
        `Pro gives you ${proQuota} analyses a month and every feature, from ${perMonth} a month on yearly billing.`,
      ],
      { label: "See my full analysis", url: PRO_URL },
      "Just looking at one or two properties? The 3-analysis pack costs €12, no subscription.",
    );
  }
  if (locale === "zh") {
    return render(
      "您的 Bricky 分析正在等您",
      [
        "您的评分和结论已经生成。完整详情(建议出价、收益率、风险、地籍)需订阅后解锁。",
        `Pro 提供每月 ${proQuota} 次分析和全部功能,按年订阅每月仅需 ${perMonth}。`,
      ],
      { label: "查看完整分析", url: PRO_URL },
      "只看一两个房源?3 次分析套餐仅需 12 €,无需订阅。",
    );
  }
  return render(
    "Votre analyse Bricky vous attend",
    [
      "Votre score et votre verdict sont prêts. Le détail complet (prix à proposer, rendement, risques, cadastre) se débloque avec un abonnement.",
      `Pro vous donne ${proQuota} analyses par mois et toutes les fonctions, dès ${perMonth} par mois en annuel.`,
    ],
    { label: "Voir mon analyse complète", url: PRO_URL },
    "Vous n'étudiez qu'un ou deux biens ? Le pack 3 analyses coûte 12 €, sans abonnement.",
  );
}
