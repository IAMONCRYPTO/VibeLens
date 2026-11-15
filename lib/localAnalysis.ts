import type { CodeBlock } from "./codeSlicer";

export interface ExplanationText {
  plainMeaning: string;
  safeToEdit: string[];
  dangerZone: string[];
  proTip: string;
}

const terms = {
  en: {
    imports: "Sets up dependencies and settings that other parts of the file use.",
    hook: "Keeps track of changing values or reacts when the component updates.",
    function: "Defines a reusable task the application can call.",
    ui: "Builds the interface and connects what you see to the code behind it.",
    logic: "Runs part of the file's logic and moves data to the next step.",
    inputs: "Names introduced", calls: "Actions called", line: "Line",
    safe: "Review this display value before changing it",
    noSafe: "No clearly cosmetic value found in this block. Trace where its values are used before editing.",
    danger: "Preserve this dependency, condition, or operation when making a cosmetic edit",
    noDanger: "Keep the block's structure and check where its values are used before changing them.",
    tip: "Change one value at a time and check the result in your app.",
  },
  hinglish: {
    imports: "Yeh block dependencies aur settings ready karta hai jo baaki file use karti hai.",
    hook: "Yeh block badalti values sambhalta hai ya component update par react karta hai.",
    function: "Yeh ek reusable kaam define karta hai jise app call kar sakti hai.",
    ui: "Yeh screen banata hai aur dikhne wale elements ko code se connect karta hai.",
    logic: "Yeh file ka logic chalata hai aur data agle step tak pahunchata hai.",
    inputs: "Naye names", calls: "Call kiye gaye actions", line: "Line",
    safe: "Is display value ko badalne se pehle check karo",
    noSafe: "Is block mein koi clearly cosmetic value nahi mili. Edit se pehle usages dekho.",
    danger: "Cosmetic edit karte waqt is dependency, condition ya operation ko sambhal kar rakho",
    noDanger: "Block ka structure rakho aur change se pehle values ke usages dekho.",
    tip: "Ek baar mein ek value change karo aur app mein result check karo.",
  },
  hi: {
    imports: "यह भाग फ़ाइल के बाकी हिस्सों के लिए ज़रूरी लाइब्रेरी और सेटिंग तैयार करता है।",
    hook: "यह भाग बदलती हुई जानकारी सँभालता है या स्क्रीन अपडेट होने पर काम करता है।",
    function: "यह ऐसा काम तय करता है जिसे ऐप बार-बार चला सकता है।",
    ui: "यह स्क्रीन बनाता है और दिखाई देने वाले हिस्सों को उनके कोड से जोड़ता है।",
    logic: "यह फ़ाइल के काम का एक हिस्सा चलाकर जानकारी अगले चरण तक पहुँचाता है।",
    inputs: "नए नाम", calls: "चलाए गए काम", line: "पंक्ति",
    safe: "दिखाई देने वाली इस वैल्यू को बदलने से पहले जाँचें",
    noSafe: "यहाँ केवल दिखावट बदलने वाली कोई स्पष्ट वैल्यू नहीं मिली। बदलाव से पहले उसका इस्तेमाल देखें।",
    danger: "दिखावट बदलते समय इस लाइब्रेरी, शर्त या क्रिया को सुरक्षित रखें",
    noDanger: "कोड की बनावट बनाए रखें और बदलने से पहले देखें कि वैल्यू कहाँ इस्तेमाल होती हैं।",
    tip: "एक बार में एक वैल्यू बदलें और ऐप में उसका असर देखें।",
  },
  es: {
    imports: "Prepara las dependencias y los ajustes que utiliza el resto del archivo.",
    hook: "Mantiene los datos que cambian o reacciona cuando se actualiza el componente.",
    function: "Define una tarea reutilizable que la aplicación puede ejecutar.",
    ui: "Construye la interfaz y conecta lo que ves con el código que responde.",
    logic: "Ejecuta parte de la lógica del archivo y pasa datos al siguiente paso.",
    inputs: "Nombres definidos", calls: "Acciones llamadas", line: "Línea",
    safe: "Revisa este valor visual antes de cambiarlo",
    noSafe: "No se encontró un valor claramente visual. Revisa dónde se usan los valores antes de editar.",
    danger: "Conserva esta dependencia, condición u operación al hacer un cambio visual",
    noDanger: "Conserva la estructura y revisa dónde se usan los valores antes de cambiarlos.",
    tip: "Cambia un valor a la vez y comprueba el resultado en tu aplicación.",
  },
  ja: {
    imports: "ファイルの他の部分で使うライブラリや設定を準備します。",
    hook: "変化する値を管理し、コンポーネントが更新されたときに処理を実行します。",
    function: "アプリから繰り返し呼び出せる処理を定義します。",
    ui: "画面を組み立て、表示される要素を処理と結び付けます。",
    logic: "ファイルの処理の一部を実行し、次の段階へデータを渡します。",
    inputs: "定義された名前", calls: "呼び出す処理", line: "行",
    safe: "変更する前に、この表示用の値を確認してください",
    noSafe: "表示専用と判断できる値がありません。編集前に使われている場所を確認してください。",
    danger: "見た目を編集するときは、この依存関係・条件・処理を維持してください",
    noDanger: "コードの構造を保ち、値の使用箇所を確認してから変更してください。",
    tip: "一度に一つの値を変更し、アプリで結果を確認してください。",
  },
};

type Language = keyof typeof terms;
type Localized = Record<Language, string>;

const behavior: { match: RegExp; text: Localized }[] = [
  { match: /stripe\.checkout\.sessions\.create/, text: {
    en: "Starts a Stripe checkout session with a price, a customer reference, and pages to visit after checkout.",
    hinglish: "Yeh price, customer reference aur wapas jaane wale pages ke saath Stripe checkout shuru karta hai.",
    hi: "यह कीमत, ग्राहक पहचान और भुगतान के बाद खुलने वाले पेज देकर Stripe चेकआउट शुरू करता है।",
    es: "Inicia el pago en Stripe con el precio, una referencia del cliente y las páginas de regreso.",
    ja: "価格、顧客の識別情報、決済後の移動先を指定して、Stripeの決済を開始します。",
  } },
  { match: /constructEvent/, text: {
    en: "Checks Stripe's signature before trusting the incoming payment notification.",
    hinglish: "Yeh payment notification par bharosa karne se pehle Stripe ka signature check karta hai.",
    hi: "यह भुगतान की सूचना पर भरोसा करने से पहले Stripe के हस्ताक्षर की जाँच करता है।",
    es: "Verifica la firma de Stripe antes de confiar en la notificación de pago.",
    ja: "支払い通知を信頼する前に、Stripeの署名を確認します。",
  } },
  { match: /skipDuplicates|credits:\s*\{\s*increment/, text: {
    en: "Records the payment event and adds account credits inside one database transaction so a retry cannot credit the same payment twice.",
    hinglish: "Yeh event aur account credits ko ek transaction mein save karta hai taaki retry par double credits na milen.",
    hi: "यह एक ही डेटाबेस ट्रांज़ैक्शन में भुगतान दर्ज करके क्रेडिट जोड़ता है, ताकि दोबारा कोशिश करने पर क्रेडिट न दोहरें।",
    es: "Registra el pago y suma créditos en una transacción para evitar que un reintento duplique los créditos.",
    ja: "支払いの記録とクレジットの追加を一つのトランザクションで行い、再試行時の二重付与を防ぎます。",
  } },
  { match: /new WebSocket|socket\.onmessage/, text: {
    en: "Opens or handles a live exchange connection so the app can react to incoming market data.",
    hinglish: "Yeh exchange ka live connection kholta ya sambhalta hai taaki app naya market data use kar sake.",
    hi: "यह एक्सचेंज से लाइव कनेक्शन खोलता या सँभालता है ताकि ऐप नया बाज़ार डेटा इस्तेमाल कर सके।",
    es: "Abre o gestiona una conexión en vivo con el exchange para reaccionar a los datos del mercado.",
    ja: "取引所とのライブ接続を開くか管理し、新しい相場データをアプリに届けます。",
  } },
  { match: /gains\s*\/\s*losses|gains\s*\+=|losses\s*\+=/, text: {
    en: "Compares upward and downward price moves to measure how strongly the market has been rising or falling.",
    hinglish: "Yeh price ke upar aur neeche jaane wale moves compare karke market ki direction ki strength dekhta hai.",
    hi: "यह कीमत में बढ़त और गिरावट की तुलना करके बाज़ार की दिशा की ताकत मापता है।",
    es: "Compara las subidas y bajadas del precio para medir la fuerza de la tendencia.",
    ja: "価格の上昇幅と下落幅を比べ、市場の動きの強さを測ります。",
  } },
  { match: /jwtVerify\s*\(/, text: {
    en: "Checks the signed session token before using it to identify the visitor.",
    hinglish: "Yeh visitor ki identity use karne se pehle signed session token verify karta hai.",
    hi: "यह उपयोगकर्ता की पहचान करने से पहले हस्ताक्षर किए गए सत्र टोकन को सत्यापित करता है।",
    es: "Verifica el token firmado de la sesión antes de usarlo para identificar a la persona.",
    ja: "利用者を識別する前に、署名付きセッショントークンを検証します。",
  } },
  { match: /consumeAllowance|\.incr\(/, text: {
    en: "Tracks how many requests the user makes in a time window and checks whether the limit has been reached.",
    hinglish: "Yeh fixed time mein user ki requests count karta hai aur check karta hai ki limit poori hui ya nahi.",
    hi: "यह तय समय में उपयोगकर्ता के अनुरोध गिनकर देखता है कि सीमा पूरी हो गई है या नहीं।",
    es: "Cuenta las solicitudes dentro de un período y comprueba si se alcanzó el límite.",
    ja: "一定時間内のリクエスト数を数え、上限に達したか確認します。",
  } },
  { match: /fetch\("\/api\/checkout"|location\.assign/, text: {
    en: "Starts checkout through the app's API or sends the visitor to the verified payment page.",
    hinglish: "Yeh app ke API se checkout shuru karta hai ya visitor ko verified payment page par bhejta hai.",
    hi: "यह ऐप के API से भुगतान शुरू करता है या उपयोगकर्ता को सत्यापित भुगतान पेज पर भेजता है।",
    es: "Inicia el pago mediante la API de la aplicación o lleva al visitante a la página de pago verificada.",
    ja: "アプリのAPIで決済を開始するか、確認済みの決済ページに利用者を移動させます。",
  } },
  { match: /applyPromo|hasOwn\(PROMOS/, text: {
    en: "Looks up a promo code and uses a valid discount to calculate or update the checkout price.",
    hinglish: "Yeh promo code check karta hai aur valid discount se checkout price calculate ya update karta hai.",
    hi: "यह प्रोमो कोड जाँचता है और मान्य छूट से चेकआउट की कीमत तय या अपडेट करता है।",
    es: "Busca el código promocional y usa un descuento válido para calcular o actualizar el precio.",
    ja: "プロモコードを確認し、有効な割引で決済価格を計算または更新します。",
  } },
];

export function languageKey(lang: string): keyof typeof terms {
  return Object.hasOwn(terms, lang) ? lang as keyof typeof terms : "en";
}

export function explainLocally(block: CodeBlock, lang: string): ExplanationText {
  const language = languageKey(lang);
  const t = terms[language];
  const specific = behavior.filter((item) => item.match.test(block.code)).map((item) => item.text[language]);
  const names = [...block.code.matchAll(/\b(?:const|let|var|function|class|def|contract)\s+([$\w]+)|^\s*([A-Za-z_]\w*)\s*=/gm)]
    .map((match) => match[1] ?? match[2]);
  const calls = [...block.code.matchAll(/\b([\w$.]+)\s*\(/g)].map((match) => match[1])
    .filter((name) => !/^(if|for|switch|while|catch|return|function|async)$/.test(name) && !names.includes(name));
  const safeToEdit: string[] = [];
  const dangerZone: string[] = [];
  let showedImport = false;

  block.code.split("\n").forEach((line, index) => {
    const number = block.startLine + index;
    const label = lang === "ja" ? number + t.line : t.line + " " + number;
    const displayLiteral = line.match(/\b[\w$]*(?:title|label|caption|placeholder|color|colour|opacity|radius|padding|font_?size|gap|spacing|product_name)[\w$]*\s*[:=]\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(-?\d+(?:\.\d+)?))/i);
    const classValue = line.match(/(?:className|placeholder|aria-label)\s*=\s*["']([^"']+)["']/)?.[1];
    const visibleText = line.match(/>([^<>{}]+)</)?.[1];
    const value = displayLiteral?.slice(1).find((match) => match !== undefined) ?? classValue ?? visibleText;
    if (value?.trim()) safeToEdit.push(label + " · " + t.safe + " · " + value.trim().slice(0, 96));
    const guarded = line.match(/\b(?:jwtVerify|constructEvent|transaction|payment_status|skipDuplicates|authorization|SESSION_SECRET|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|preventDefault|useEffect|fetch|JSON\.parse|return|throw|await|import|assert|raise|require|if|for|while)\b/);
    if (!guarded || (guarded[0] === "import" && showedImport)) return;
    if (guarded[0] === "import") showedImport = true;
    dangerZone.push(label + " · " + t.danger + " · " + guarded[0]);
  });

  const labels = [...new Set(names)].slice(0, 4).join(", ");
  const actions = [...new Set(calls)].slice(0, 3).join(", ");
  return {
    plainMeaning: [specific.length ? specific.slice(0, 2).join(" ") : t[block.category], labels && t.inputs + " · " + labels + ".", actions && t.calls + " · " + actions + "."].filter(Boolean).join(" "),
    safeToEdit: safeToEdit.length ? safeToEdit.slice(0, 4) : [t.noSafe],
    dangerZone: dangerZone.length ? dangerZone.slice(0, 5) : [t.noDanger],
    proTip: t.tip,
  };
}

export interface Connection { from: string; to: string; label: string }
export interface Finding { line: number; severity: "high" | "medium"; message: string }
export interface Architecture { connections: Connection[]; summary: string; findings: Finding[]; source: "cloud" | "fallback"; cloudCalls: number }

export function inspectLocally(blocks: CodeBlock[]) {
  const definitions = new Map<string, string>();
  for (const block of blocks) {
    for (const match of block.code.matchAll(/\b(?:function|def|class|contract|const|let)\s+([\w$]+)/g)) {
      definitions.set(match[1], block.id);
    }
  }
  const connections: Connection[] = [];
  const findings: Finding[] = [];
  for (const block of blocks) {
    const linked = new Set<string>();
    for (const word of block.code.matchAll(/[\w$]+/g)) {
      const target = definitions.get(word[0]);
      if (target && target !== block.id && !linked.has(target)) {
        linked.add(target);
        connections.push({ from: block.id, to: target, label: word[0] });
      }
    }
    block.code.split("\n").forEach((code, index) => {
      const line = block.startLine + index;
      if (/\b(?:sk_live_[\w]{12,}|AIza[\w-]{30,}|gh[pousr]_[\w]{20,}|AKIA[A-Z0-9]{16})\b|BEGIN [A-Z ]*PRIVATE KEY|(?:secret|password|api[_-]?key|token)[\w]*["']?\s*[:=]\s*["'][^"']{8,}["']/i.test(code)) {
        findings.push({ line, severity: "high", message: "Possible embedded credential. Check the assignment and rotate any exposed credential." });
      } else if (/\b(?:eval\s*\(|new Function\s*\(|dangerouslySetInnerHTML\b|innerHTML\s*=|shell\s*=\s*True)/.test(code)) {
        findings.push({ line, severity: "medium", message: "Check whether untrusted input can reach this execution or markup operation." });
      }
    });
  }
  const summary = blocks.length + " blocks · " + connections.length + " symbol links detected.";
  return { connections, summary, findings };
}
