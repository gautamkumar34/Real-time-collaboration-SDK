const properties = [
  'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY', 
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 
  'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 
  'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 
  'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize'
];

const isBrowser = (typeof window !== 'undefined');
const isFirefox = (isBrowser && (window as any).mozInnerScreenX != null);

export function getCaretCoordinates(element: HTMLTextAreaElement, position: number) {
  const div = document.createElement('div');
  div.id = 'input-textarea-caret-position-mirror-div';
  document.body.appendChild(div);

  const style = div.style;
  const computed = window.getComputedStyle ? window.getComputedStyle(element) : (element as any).currentStyle;
  const isInput = element.nodeName === 'INPUT';

  style.whiteSpace = 'pre-wrap';
  if (!isInput)
    style.wordWrap = 'break-word';

  style.position = 'absolute';
  style.visibility = 'hidden';

  properties.forEach((prop: any) => {
    if (isInput && prop === 'lineHeight') {
      if (computed.boxSizing === 'border-box') {
        const height = parseInt(computed.height);
        const outerHeight =
          parseInt(computed.paddingTop) +
          parseInt(computed.paddingBottom) +
          parseInt(computed.borderTopWidth) +
          parseInt(computed.borderBottomWidth);
        const targetHeight = outerHeight + parseInt(computed.lineHeight);
        if (height > targetHeight) {
          style.lineHeight = height - outerHeight + 'px';
        } else if (height === targetHeight) {
          style.lineHeight = computed.lineHeight;
        } else {
          style.lineHeight = 0 + 'px';
        }
      } else {
        style.lineHeight = computed.height;
      }
    } else {
      style[prop] = computed[prop];
    }
  });

  if (isFirefox) {
    if (element.scrollHeight > parseInt(computed.height))
      style.overflowY = 'scroll';
  } else {
    style.overflow = 'hidden';
  }

  div.textContent = element.value.substring(0, position);
  
  if (isInput && div.textContent) {
    div.textContent = div.textContent.replace(/\s/g, '\u00a0');
  }

  const span = document.createElement('span');
  span.textContent = element.value.substring(position) || '.';
  div.appendChild(span);

  const safeParseInt = (val: any, fallback = 0) => {
    const parsed = parseInt(val);
    return isNaN(parsed) ? fallback : parsed;
  };

  const coordinates = {
    top: span.offsetTop + safeParseInt(computed.borderTopWidth),
    left: span.offsetLeft + safeParseInt(computed.borderLeftWidth),
    height: safeParseInt(computed.lineHeight, 20)
  };

  document.body.removeChild(div);

  return coordinates;
}
