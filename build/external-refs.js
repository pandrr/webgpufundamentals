// check with removing the last 's'?
const refs = {
  ArrayBuffer: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer',
  TypedArray: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer',
};

export function getLinkForKeyword(keyword) {
  let r = refs[keyword];
  if (!r && keyword.endsWith('s')) {
    r = refs[keyword.substring(0, keyword.length - 1)];
  }
  return r;
}