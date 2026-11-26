// Quoted strings are already individual spans. A balanced, valid JSON value
// is an explicit data operand even when it contains nested arrays or objects.
export function collectExplicitValues(text, sourceSpans) {
  const spans = []
  const opens = new Map([['[',']'],['{','}']])
  for (let i = 0; i < sourceSpans.length; i++) {
    const [start,end] = sourceSpans[i]
    const first = text.slice(start,end)
    if (opens.has(first)) {
      const stack = [opens.get(first)]
      let j = i+1
      for (; j < sourceSpans.length && stack.length; j++) {
        const token = text.slice(...sourceSpans[j])
        if (opens.has(token)) stack.push(opens.get(token))
        else if ([']','}'].includes(token) && token !== stack.pop()) break
      }
      if (!stack.length && text.slice(...sourceSpans[j-1]) === opens.get(first)) {
        const stop = sourceSpans[j-1][1]
        try {
          JSON.parse(text.slice(start,stop))
          spans.push([start,stop,true])
          i = j-1
          continue
        } catch { /* Brackets can enclose ordinary language. */ }
      }
    }
    spans.push([start,end,false])
  }
  return spans
}
