export function qs<T extends Element>(selector: string, parent: ParentNode = document): T {
  const element = parent.querySelector<T>(selector);
  if (!element) {
    throw new Error(`找不到元素: ${selector}`);
  }
  return element;
}
