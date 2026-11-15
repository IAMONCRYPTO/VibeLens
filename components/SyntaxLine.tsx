const tokenPattern = /(\/\/.*$|#\s.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60|\b(?:import|from|export|default|const|let|var|async|await|return|function|if|else|try|catch|new|type|class|def|for|in|while|throw|with|yield|contract|public)\b|\b(?:true|false|null|undefined|None|True|False|\d+(?:\.\d+)?)\b|\b[A-Z][\w$]*\b|\b[\w$]+(?=\s*\())/g;

export function SyntaxLine({ text }: { text: string }) {
  return <>{text.split(tokenPattern).map((part, index) => {
    if (!(index % 2)) return part;
    const style = /^(\/\/|#)/.test(part) ? "tok-comment" : /^["'\x60]/.test(part) ? "tok-string" :
      /^(?:\d|true$|false$|null$|undefined$|None$|True$|False$)/.test(part) ? "tok-number" :
      /^[A-Z]/.test(part) ? "tok-type" : /^(import|from|export|default|const|let|var|async|await|return|function|if|else|try|catch|new|type|class|def|for|in|while|throw|with|yield|contract|public)$/.test(part)
        ? "tok-keyword" : "tok-call";
    return <span className={style} key={index}>{part}</span>;
  })}</>;
}
