export function getElementXPath(element: Element): string {
  if (element.id) return `//*[@id=${toXPathLiteral(element.id)}]`;

  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }
  return `/${parts.join('/')}`;
}

export function findElementByXPath(xpath: string, root: Document | Element = document): Element | null {
  try {
    const doc = root instanceof Document ? root : root.ownerDocument ?? document;
    const result = doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const node = result.singleNodeValue;
    return node instanceof Element ? node : null;
  } catch {
    return null;
  }
}

function toXPathLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return `concat(${value.split('"').map((part) => `"${part}"`).join(', \'"\', ')})`;
}
