var CPHHelpers = {};

CPHHelpers.caseicon = function caseicon () {
  return '<svg version="1.1" xmlns="https://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="fill: currentColor;" xml:space="preserve"><g><path d="M209.3,330.3H75l-30.5,84.3H0.2l123-322.1h28.3h9.3L284,414.6h-44L209.3,330.3z M196.7,295.6L142,145.1L87.6,295.6H196.7z" /><path d="M505.7,388.4c1.5,8.9,3.5,16.5,6.2,22.7v3.5h-43.1c-2.5-5.8-4.4-14.1-5.8-25c-8.3,8.8-18.2,16-29.8,21.3 c-11.6,5.4-24.3,8.1-38.2,8.1c-15.9,0-30.1-3.1-42.4-9.4c-12.3-6.3-21.8-14.8-28.5-25.6c-6.7-10.8-10.1-22.7-10.1-35.8 c0-17,4.4-31.3,13.2-43.1c8.8-11.8,21.2-20.7,37.4-26.7c16.1-6,35.2-9,57.2-9h40.3v-19c0-14.6-4.3-26.1-12.9-34.4 c-8.6-8.3-21.1-12.5-37.3-12.5c-9.9,0-18.7,1.7-26.5,5.2c-7.8,3.5-13.9,8.1-18.3,13.9c-4.4,5.8-6.5,12.1-6.5,18.9h-41.4 c0-11.6,4-22.9,11.9-33.8c8-10.9,19.2-19.8,33.6-26.7c14.5-6.9,31-10.3,49.6-10.3c17.7,0,33.2,3,46.6,9c13.3,6,23.8,15,31.3,27 c7.5,12,11.3,26.7,11.3,44.1v111.5C503.5,370.8,504.2,379.4,505.7,388.4z M427.5,378.6c8.2-3.3,15.2-7.7,21.1-13.2 c5.9-5.5,10.4-11.4,13.5-17.7v-49.6h-33.6c-23.6,0-41.7,3.7-54.2,11.2c-12.5,7.4-18.8,18.5-18.8,33.1c0,7.8,1.8,14.8,5.3,21 c3.5,6.2,8.7,11.1,15.5,14.7c6.8,3.6,15,5.4,24.8,5.4C410.5,383.6,419.3,381.9,427.5,378.6z"/></g></svg>';
};


CPHHelpers.regexicon = function regexicon () {
  return '<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="fill: currentColor;" xml:space="preserve"><g><path d="M26,512V398.6h113.4V512H26z"/><path d="M259.9,101l15.8-48.8C312.1,65,338.5,76.1,355,85.5c-4.3-41.4-6.6-69.9-6.9-85.5h49.8c-0.7,22.7-3.3,51.1-7.9,85.2 c23.6-11.9,50.6-22.9,81-33l15.8,48.8c-29.1,9.6-57.6,16-85.5,19.2c14,12.1,33.7,33.8,59.1,64.9l-41.2,29.2 c-13.3-18.1-29-42.7-47-73.8c-16.9,32.3-31.8,56.9-44.6,73.8L287,185.1c26.6-32.7,45.6-54.4,57-64.9 C314.5,114.5,286.4,108.1,259.9,101z"/></g></svg>';
};

CPHHelpers.safeHTML = function safeHTML (str) {
  str = (str + '').replace(/^javascript\:/gi, '');
  return str
    .replace(/&/gi, '&amp;')
    .replace(/</gi, '&lt;')
    .replace(/>/gi, '&gt;')
    .replace(/"/gi, '&quot;');
};

CPHHelpers.TEXT_TYPES = {
  'application/json': true,
  'application/javascript': true,
  'application/xml': true,
  'application/octet-stream': true,
  'application/msword': true,
  'application/x-sql': true
};

CPHHelpers.isBinaryType = function isBinaryType (type) {
  type = (type || '').split(';')[0];
  return type &&
    !type.match(/^text\//i) &&
    !CPHHelpers.TEXT_TYPES[type];
};

CPHHelpers.isMac = function isMac () {
  return !!navigator.platform.match(/(Mac|iPhone|iPod|iPad)/i);
};

CPHHelpers.isWindows = function isWindows() {
  return navigator.platform.indexOf('Win') > -1
};

CPHHelpers.isLinux = function isLinux() {
  return navigator.platform.indexOf('Lin') > -1
};

// https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#The_Unicode_Problem
CPHHelpers.u_atob = function u_atob (str) {
  return decodeURIComponent(Array.prototype.map.call(atob(str), function (c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
};

CPHHelpers.u_btoa = function u_btoa (str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
    return String.fromCharCode(parseInt(p1, 16));
  }));
};

CPHHelpers._unsafe_uuidv4 = function _unsafe_uuidv4 () {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, function (c) {
    return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
  });
}

CPHHelpers.base64ToBlob = function base64ToBlob (b64data, contentType, sliceSize) {
  contentType = contentType || 'application/octet-stream';
  sliceSize = sliceSize || 512;
  var byteCharacters = window.atob(b64data);
  var byteArrays = [];
  for (var offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    var slice = byteCharacters.slice(offset, offset + sliceSize);
    var byteNumbers = new Array(slice.length);
    for (var i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    var byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  var blob = new Blob(byteArrays, {type: contentType});
  return blob;
};

CPHHelpers.generateMarkdownDocument = (function () {
  var GITHUB_CSS = 'Ym9keSBocixib2R5IGltZ3tib3gtc2l6aW5nOmNvbnRlbnQtYm94fWJvZHkgLnBsLWNvcmwsYm9keSBhOmhvdmVye3RleHQtZGVjb3JhdGlvbjp1bmRlcmxpbmV9Ym9keSBocjo6YWZ0ZXIsYm9keTo6YWZ0ZXJ7Y2xlYXI6Ym90aH1ib2R5IHByZSxib2R5IHByZSBjb2Rle3dvcmQtd3JhcDpub3JtYWx9QGZvbnQtZmFjZXtmb250LWZhbWlseTpvY3RpY29ucy1saW5rO3NyYzp1cmwoZGF0YTpmb250L3dvZmY7Y2hhcnNldD11dGYtODtiYXNlNjQsZDA5R1JnQUJBQUFBQUFad0FCQUFBQUFBQ0ZRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUJFVTBsSEFBQUdhQUFBQUFnQUFBQUlBQUFBQVVkVFZVSUFBQVpjQUFBQUNnQUFBQW9BQVFBQVQxTXZNZ0FBQXlRQUFBQkpBQUFBWUZZRVUzUmpiV0Z3QUFBRGNBQUFBRVVBQUFDQUFKVGh2bU4yZENBQUFBVGtBQUFBQkFBQUFBUUFBQUFBWm5CbmJRQUFBN2dBQUFDeUFBQUJDVU0rOElobllYTndBQUFHVEFBQUFCQUFBQUFRQUJvQUkyZHNlV1lBQUFGc0FBQUJQQUFBQVp3Y0VxOXRhR1ZoWkFBQUFzZ0FBQUEwQUFBQU5naDRhOTFvYUdWaEFBQURDQUFBQUJvQUFBQWtDQThEUkdodGRIZ0FBQUw4QUFBQURBQUFBQXdHQUFDZmJHOWpZUUFBQXNBQUFBQUlBQUFBQ0FCaUFUQnRZWGh3QUFBQ3FBQUFBQmdBQUFBZ0FBOEFTbTVoYldVQUFBVG9BQUFCUWdBQUFsWHU3M3NPY0c5emRBQUFCaXdBQUFBZUFBQUFNRTNRcE9Cd2NtVndBQUFFYkFBQUFIWUFBQUIvYUZHcGszamFUWTZ4YThKQUdNVy9PNjJCRGkwdEpMWVFpbmNYRXlwWUlpR0pqU2dIbmlRNnVtVHNVRXlMbTVCVjZOREJQOFRwdHM2RjB2K2svMGFuMmkraXRIRHczdjIrOStEQktUenNKTm5XSk5UZ0hFeTRCZ0czRU1JOURDRURPR0VYekRBRFU1aEJLTUlnTlBacW9EM1NpbFZhWFpDRVIzL0k3QXR4RUpMdHp6dVpmSStWVmtwcnhUbFhTaFdLYjNUQmVjRzExcndvTmxtbW4xUDJXWWNKY3psMzJldFNwS256aUM3bFF5V2Uxc21WUHkvTHQ3S2MrMHZXWS9nQWdJSUVxQU45d2UwcHdLWHJlaU1hc3h2YWJEUU1NNHJpTytxeE0yb2d3REdPWlRYeHd4RGl5Y1FJY29ZRkJMajVLM0VJYVNjdEFxMmtUWWl3K3ltaGNlN3Z3TTlqU3FPOEp5VmQ1Ukg5Z3lUdDIrSi95VW1ZbElSMHMwNG42KzdWbTFvemV6VWVMRWFVamhhRFN1WEh3VlJndkxKbjF0UTd4aXVWdi9vY1RSRjQybU5nWkdCZ1lHYndaT0JpQUFGR0pCSU1BQWl6QUZvQUFBQmlBR0lBem5qYVkyQmtZR0FBNGluOHp3WGkrVzIrTWpDek1JREFwU3d2WHpDOTdaNElnOE4vQnhZR1pnY2dsNTJCQ1NRS0FBM2pDVjhDQUFCZkFBQUFBQVFBQUVCNDJtTmdaR0JnNGYzdkFDUVpRQUJJTWpLZ0FtWUFLRWdCWGdBQWVOcGpZR1k2d1RpQmdaV0JnMmttVXhvREE0TVBoR1pNWXpCaTFBSHlnVkxZUVVDYWF3cURBNFBDaHhobWgvOE9EREVzdkF3SGdNS01JRG5HTDB4N2dKUUNBd01BSmQ0TUZ3QUFBSGphWTJCZ1lHYUE0REFHUmdZUWtBSHlHTUY4TmdZcklNM0pJQUdWWVlEVCtBRWpBd3VERnBCbUE5S01ERXdNQ2g5aS92OEg4c0gwLzRkUWMxaUFtQWtBTGFVS0xnQUFBSGphVFk5TERzSWdFSWJ0Z3FIVVBwRGkzZ1BvQlZ5UlRtVGRkT21xVFhUaEVYcXJvYjJnUTFGandwRHZmd0NCZG1kWEM1QVZLRnUzZTVNZk5GSjI5S1RRVDQ4T2I5L2xxWXdPR1p4ZVVlbE4yVTJSNitjQXJndENKcGF1VzdVUUJxbkZrVXNqQVkva09VMWNQK0RBZ3Z4d24xY2haRHdVYmQ2Q0ZpbUdYd3p3RjZ0UGJGSWNqRWwrdnZtTS9ieUE0OGU2dFdyS0FybTRaSmxDYmRzcnhrc0wxQXdXbi95QlNKS3BZYnE4QVhhYVRiOEFBSGphMjhqQXdPQzAwWnJCZVFORFFPV08vL3NkQkJnWUdSaVlXWUFFRUxFd01URTR1em81WnpvNWIyQnhkbkZPY0FMeE5qQTZiMkJ5VHN3QzhqWXdnMFZsTnVvQ1RXQU1xTnpNenNvSzFyRWhOcUJ5RXllcmc1UE1KbFl1VnVlRVRLY2QvODl1QnBucHZJRVZvbWVITG9Nc0FBZTFJZDRBQUFBQUFBQjQyb1dRVDA3Q1FCVEd2MEpCaGFnazdIUXpLeGNhMnNKQ0UxaER0NFFGKzlKT1MwbmJhYVlEQ1Fmd0NKN0F1M0FIaitMTzEzRk1tbTZjbDc3ODV2dmVuMGtCakhDQmhmcFl1TmE1UGgxYzBlMlh1M2pFdldHN1VkUERMWjROOTJuT20rRUJYdUFiSG1JTVNSTXMrNGFVRWQ0TmQzQ0hEOE5kdk9MVHNBMkdMOE05UE9EYmNMK2hEN0MxeG9hSGVMSlNFYW8wRkVXMTRja3hDK1RVOFR4dnNZNlgwZUxQbVJocnkyV1Zpb0xwa3JicDg0TExRUEdJN2M2c09pVXpwV0lXUzVHemxTZ1V6ekxCU2lrT1BGVE9YcWx5N3JxeDBaMVE1QkFJb1pCU0ZpaFFZUU9PQkVka0NPZ1hUT0hBMDdIQUdqR1dpSWphUFpOVzEzLytsbTZTOUZUN3JMSEZKNmZRYmtBVE9HMWoyT0ZNdWNLSkpzeElWZlFPUmwrOUp5ZGE2U2wxZFVZaFNDbTFkeUNsZm9lRHZlNHFNWWRMRWJmcUhmM08vQWREdW1zakFBQjQybU5nWW9BQVpRWWpCbXlBR1lRWm1kaEw4ekxkREV5ZEFSZm9BcUlBQUFBQkFBTUFCd0FLQUJNQUIvLy9BQThBQVFBQUFBQUFBQUFBQUFBQUFBQUJBQUFBQUE9PSkgZm9ybWF0KCd3b2ZmJyl9Ym9keXstbXMtdGV4dC1zaXplLWFkanVzdDoxMDAlOy13ZWJraXQtdGV4dC1zaXplLWFkanVzdDoxMDAlO2NvbG9yOiMyNDI5MmU7Zm9udC1mYW1pbHk6LWFwcGxlLXN5c3RlbSxCbGlua01hY1N5c3RlbUZvbnQsIlNlZ29lIFVJIixIZWx2ZXRpY2EsQXJpYWwsc2Fucy1zZXJpZiwiQXBwbGUgQ29sb3IgRW1vamkiLCJTZWdvZSBVSSBFbW9qaSIsIlNlZ29lIFVJIFN5bWJvbCI7Zm9udC1zaXplOjE2cHg7bGluZS1oZWlnaHQ6MS41O3dvcmQtd3JhcDpicmVhay13b3JkfWJvZHkgLnBsLWN7Y29sb3I6IzZhNzM3ZH1ib2R5IC5wbC1jMSxib2R5IC5wbC1zIC5wbC12e2NvbG9yOiMwMDVjYzV9Ym9keSAucGwtZSxib2R5IC5wbC1lbntjb2xvcjojNmY0MmMxfWJvZHkgLnBsLXMgLnBsLXMxLGJvZHkgLnBsLXNtaXtjb2xvcjojMjQyOTJlfWJvZHkgLnBsLWVudHtjb2xvcjojMjI4NjNhfWJvZHkgLnBsLWt7Y29sb3I6I2Q3M2E0OX1ib2R5IC5wbC1wZHMsYm9keSAucGwtcyxib2R5IC5wbC1zIC5wbC1wc2UgLnBsLXMxLGJvZHkgLnBsLXNyLGJvZHkgLnBsLXNyIC5wbC1jY2UsYm9keSAucGwtc3IgLnBsLXNyYSxib2R5IC5wbC1zciAucGwtc3Jle2NvbG9yOiMwMzJmNjJ9Ym9keSAucGwtc213LGJvZHkgLnBsLXZ7Y29sb3I6I2UzNjIwOX1ib2R5IC5wbC1idXtjb2xvcjojYjMxZDI4fWJvZHkgLnBsLWlpe2NvbG9yOiNmYWZiZmM7YmFja2dyb3VuZC1jb2xvcjojYjMxZDI4fWJvZHkgLnBsLWMye2NvbG9yOiNmYWZiZmM7YmFja2dyb3VuZC1jb2xvcjojZDczYTQ5fWJvZHkgLnBsLWMyOjpiZWZvcmV7Y29udGVudDoiXk0ifWJvZHkgLnBsLXNyIC5wbC1jY2V7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOiMyMjg2M2F9Ym9keSAucGwtbWx7Y29sb3I6IzczNWMwZn1ib2R5IC5wbC1taCxib2R5IC5wbC1taCAucGwtZW4sYm9keSAucGwtbXN7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOiMwMDVjYzV9Ym9keSAucGwtbWl7Zm9udC1zdHlsZTppdGFsaWM7Y29sb3I6IzI0MjkyZX1ib2R5IC5wbC1tYntmb250LXdlaWdodDo3MDA7Y29sb3I6IzI0MjkyZX1ib2R5IC5wbC1tZHtjb2xvcjojYjMxZDI4O2JhY2tncm91bmQtY29sb3I6I2ZmZWVmMH1ib2R5IC5wbC1taTF7Y29sb3I6IzIyODYzYTtiYWNrZ3JvdW5kLWNvbG9yOiNmMGZmZjR9Ym9keSAucGwtbWN7Y29sb3I6I2UzNjIwOTtiYWNrZ3JvdW5kLWNvbG9yOiNmZmViZGF9Ym9keSAucGwtbWkye2NvbG9yOiNmNmY4ZmE7YmFja2dyb3VuZC1jb2xvcjojMDA1Y2M1fWJvZHkgLnBsLW1kcntmb250LXdlaWdodDo3MDA7Y29sb3I6IzZmNDJjMX1ib2R5IC5wbC1iYXtjb2xvcjojNTg2MDY5fWJvZHkgLnBsLXNne2NvbG9yOiM5NTlkYTV9Ym9keSAucGwtY29ybHtjb2xvcjojMDMyZjYyfWJvZHkgLm9jdGljb257ZGlzcGxheTppbmxpbmUtYmxvY2s7ZmlsbDpjdXJyZW50Q29sb3I7dmVydGljYWwtYWxpZ246dGV4dC1ib3R0b219Ym9keSBocjo6YWZ0ZXIsYm9keSBocjo6YmVmb3JlLGJvZHk6OmFmdGVyLGJvZHk6OmJlZm9yZXtkaXNwbGF5OnRhYmxlO2NvbnRlbnQ6IiJ9Ym9keSBhe2JhY2tncm91bmQtY29sb3I6dHJhbnNwYXJlbnQ7Y29sb3I6IzAzNjZkNjt0ZXh0LWRlY29yYXRpb246bm9uZX1ib2R5IGE6YWN0aXZlLGJvZHkgYTpob3ZlcntvdXRsaW5lLXdpZHRoOjB9Ym9keSBoMXttYXJnaW46LjY3ZW0gMH1ib2R5IGltZ3tib3JkZXItc3R5bGU6bm9uZTttYXgtd2lkdGg6MTAwJTtiYWNrZ3JvdW5kLWNvbG9yOiNmZmZ9Ym9keSBoMSxib2R5IGgye3BhZGRpbmctYm90dG9tOi4zZW07Ym9yZGVyLWJvdHRvbToxcHggc29saWQgI2VhZWNlZn1ib2R5IGlucHV0e2ZvbnQ6aW5oZXJpdDttYXJnaW46MDtvdmVyZmxvdzp2aXNpYmxlO2ZvbnQtZmFtaWx5OmluaGVyaXQ7Zm9udC1zaXplOmluaGVyaXQ7bGluZS1oZWlnaHQ6aW5oZXJpdH1ib2R5IGRsIGR0LGJvZHkgc3Ryb25nLGJvZHkgdGFibGUgdGh7Zm9udC13ZWlnaHQ6NjAwfWJvZHkgY29kZSxib2R5IHByZXtmb250LWZhbWlseTpTRk1vbm8tUmVndWxhcixDb25zb2xhcywiTGliZXJhdGlvbiBNb25vIixNZW5sbyxDb3VyaWVyLG1vbm9zcGFjZX1ib2R5IFt0eXBlPWNoZWNrYm94XXtib3gtc2l6aW5nOmJvcmRlci1ib3g7cGFkZGluZzowfWJvZHkgKntib3gtc2l6aW5nOmJvcmRlci1ib3h9Ym9keSBhOm5vdChbaHJlZl0pLGJvZHkgaDE6aG92ZXIgLmFuY2hvcixib2R5IGgyOmhvdmVyIC5hbmNob3IsYm9keSBoMzpob3ZlciAuYW5jaG9yLGJvZHkgaDQ6aG92ZXIgLmFuY2hvcixib2R5IGg1OmhvdmVyIC5hbmNob3IsYm9keSBoNjpob3ZlciAuYW5jaG9ye3RleHQtZGVjb3JhdGlvbjpub25lfWJvZHkgdGFibGV7Ym9yZGVyLXNwYWNpbmc6MDtib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7ZGlzcGxheTpibG9jazt3aWR0aDoxMDAlO292ZXJmbG93OmF1dG99Ym9keSB0ZCxib2R5IHRoe3BhZGRpbmc6MH1ib2R5IGJsb2NrcXVvdGV7bWFyZ2luOjB9Ym9keSBvbCBvbCxib2R5IHVsIG9se2xpc3Qtc3R5bGUtdHlwZTpsb3dlci1yb21hbn1ib2R5IG9sIG9sIG9sLGJvZHkgb2wgdWwgb2wsYm9keSB1bCBvbCBvbCxib2R5IHVsIHVsIG9se2xpc3Qtc3R5bGUtdHlwZTpsb3dlci1hbHBoYX1ib2R5IGRke21hcmdpbi1sZWZ0OjB9Ym9keSAucGwtMHtwYWRkaW5nLWxlZnQ6MCFpbXBvcnRhbnR9Ym9keSAucGwtMXtwYWRkaW5nLWxlZnQ6NHB4IWltcG9ydGFudH1ib2R5IC5wbC0ye3BhZGRpbmctbGVmdDo4cHghaW1wb3J0YW50fWJvZHkgLnBsLTN7cGFkZGluZy1sZWZ0OjE2cHghaW1wb3J0YW50fWJvZHkgLnBsLTR7cGFkZGluZy1sZWZ0OjI0cHghaW1wb3J0YW50fWJvZHkgLnBsLTV7cGFkZGluZy1sZWZ0OjMycHghaW1wb3J0YW50fWJvZHkgLnBsLTZ7cGFkZGluZy1sZWZ0OjQwcHghaW1wb3J0YW50fWJvZHk+OmZpcnN0LWNoaWxke21hcmdpbi10b3A6MCFpbXBvcnRhbnR9Ym9keT46bGFzdC1jaGlsZHttYXJnaW4tYm90dG9tOjAhaW1wb3J0YW50fWJvZHkgYTpub3QoW2hyZWZdKXtjb2xvcjppbmhlcml0fWJvZHkgLmFuY2hvcntmbG9hdDpsZWZ0O3BhZGRpbmctcmlnaHQ6NHB4O21hcmdpbi1sZWZ0Oi0yMHB4O2xpbmUtaGVpZ2h0OjF9Ym9keSBkbCxib2R5IGhye3BhZGRpbmc6MH1ib2R5IC5hbmNob3I6Zm9jdXN7b3V0bGluZTowfWJvZHkgYmxvY2txdW90ZSxib2R5IGRsLGJvZHkgb2wsYm9keSBwLGJvZHkgcHJlLGJvZHkgdGFibGUsYm9keSB1bHttYXJnaW4tdG9wOjA7bWFyZ2luLWJvdHRvbToxNnB4fWJvZHkgaHJ7b3ZlcmZsb3c6aGlkZGVuO2JhY2tncm91bmQ6I2UxZTRlODtoZWlnaHQ6LjI1ZW07bWFyZ2luOjI0cHggMDtib3JkZXI6MH1ib2R5IGJsb2NrcXVvdGV7cGFkZGluZzowIDFlbTtjb2xvcjojNmE3MzdkO2JvcmRlci1sZWZ0Oi4yNWVtIHNvbGlkICNkZmUyZTV9Ym9keSBibG9ja3F1b3RlPjpmaXJzdC1jaGlsZHttYXJnaW4tdG9wOjB9Ym9keSBibG9ja3F1b3RlPjpsYXN0LWNoaWxke21hcmdpbi1ib3R0b206MH1ib2R5IGgxLGJvZHkgaDIsYm9keSBoMyxib2R5IGg0LGJvZHkgaDUsYm9keSBoNnttYXJnaW4tdG9wOjI0cHg7bWFyZ2luLWJvdHRvbToxNnB4O2ZvbnQtd2VpZ2h0OjYwMDtsaW5lLWhlaWdodDoxLjI1fWJvZHkgaDEgLm9jdGljb24tbGluayxib2R5IGgyIC5vY3RpY29uLWxpbmssYm9keSBoMyAub2N0aWNvbi1saW5rLGJvZHkgaDQgLm9jdGljb24tbGluayxib2R5IGg1IC5vY3RpY29uLWxpbmssYm9keSBoNiAub2N0aWNvbi1saW5re2NvbG9yOiMxYjFmMjM7dmVydGljYWwtYWxpZ246bWlkZGxlO3Zpc2liaWxpdHk6aGlkZGVufWJvZHkgaDE6aG92ZXIgLmFuY2hvciAub2N0aWNvbi1saW5rLGJvZHkgaDI6aG92ZXIgLmFuY2hvciAub2N0aWNvbi1saW5rLGJvZHkgaDM6aG92ZXIgLmFuY2hvciAub2N0aWNvbi1saW5rLGJvZHkgaDQ6aG92ZXIgLmFuY2hvciAub2N0aWNvbi1saW5rLGJvZHkgaDU6aG92ZXIgLmFuY2hvciAub2N0aWNvbi1saW5rLGJvZHkgaDY6aG92ZXIgLmFuY2hvciAub2N0aWNvbi1saW5re3Zpc2liaWxpdHk6dmlzaWJsZX1ib2R5IGgxe2ZvbnQtc2l6ZToyZW19Ym9keSBoMntmb250LXNpemU6MS41ZW19Ym9keSBoM3tmb250LXNpemU6MS4yNWVtfWJvZHkgaDR7Zm9udC1zaXplOjFlbX1ib2R5IGg1e2ZvbnQtc2l6ZTouODc1ZW19Ym9keSBoNntmb250LXNpemU6Ljg1ZW07Y29sb3I6IzZhNzM3ZH1ib2R5IG9sLGJvZHkgdWx7cGFkZGluZy1sZWZ0OjJlbX1ib2R5IG9sIG9sLGJvZHkgb2wgdWwsYm9keSB1bCBvbCxib2R5IHVsIHVse21hcmdpbi10b3A6MDttYXJnaW4tYm90dG9tOjB9Ym9keSBsaXt3b3JkLXdyYXA6YnJlYWstYWxsfWJvZHkgbGk+cHttYXJnaW4tdG9wOjE2cHh9Ym9keSBsaStsaXttYXJnaW4tdG9wOi4yNWVtfWJvZHkgZGwgZHR7cGFkZGluZzowO21hcmdpbi10b3A6MTZweDtmb250LXNpemU6MWVtO2ZvbnQtc3R5bGU6aXRhbGljfWJvZHkgZGwgZGR7cGFkZGluZzowIDE2cHg7bWFyZ2luLWJvdHRvbToxNnB4fWJvZHkgdGFibGUgdGQsYm9keSB0YWJsZSB0aHtwYWRkaW5nOjZweCAxM3B4O2JvcmRlcjoxcHggc29saWQgI2RmZTJlNX1ib2R5IHRhYmxlIHRye2JhY2tncm91bmQtY29sb3I6I2ZmZjtib3JkZXItdG9wOjFweCBzb2xpZCAjYzZjYmQxfWJvZHkgdGFibGUgdHI6bnRoLWNoaWxkKDJuKXtiYWNrZ3JvdW5kLWNvbG9yOiNmNmY4ZmF9Ym9keSBpbWdbYWxpZ249cmlnaHRde3BhZGRpbmctbGVmdDoyMHB4fWJvZHkgaW1nW2FsaWduPWxlZnRde3BhZGRpbmctcmlnaHQ6MjBweH1ib2R5IGNvZGV7cGFkZGluZzouMmVtIC40ZW07bWFyZ2luOjA7Zm9udC1zaXplOjg1JTtiYWNrZ3JvdW5kLWNvbG9yOnJnYmEoMjcsMzEsMzUsLjA1KTtib3JkZXItcmFkaXVzOjNweH1ib2R5IHByZT5jb2Rle3BhZGRpbmc6MDttYXJnaW46MDtmb250LXNpemU6MTAwJTt3b3JkLWJyZWFrOm5vcm1hbDt3aGl0ZS1zcGFjZTpwcmU7YmFja2dyb3VuZDowIDA7Ym9yZGVyOjB9Ym9keSAuaGlnaGxpZ2h0e21hcmdpbi1ib3R0b206MTZweH1ib2R5IC5oaWdobGlnaHQgcHJle21hcmdpbi1ib3R0b206MDt3b3JkLWJyZWFrOm5vcm1hbH1ib2R5IC5oaWdobGlnaHQgcHJlLGJvZHkgcHJle3BhZGRpbmc6MTZweDtvdmVyZmxvdzphdXRvO2ZvbnQtc2l6ZTo4NSU7bGluZS1oZWlnaHQ6MS40NTtiYWNrZ3JvdW5kLWNvbG9yOiNmNmY4ZmE7Ym9yZGVyLXJhZGl1czozcHh9Ym9keSBwcmUgY29kZXtkaXNwbGF5OmlubGluZTttYXgtd2lkdGg6YXV0bztwYWRkaW5nOjA7bWFyZ2luOjA7b3ZlcmZsb3c6dmlzaWJsZTtsaW5lLWhlaWdodDppbmhlcml0O2JhY2tncm91bmQtY29sb3I6dHJhbnNwYXJlbnQ7Ym9yZGVyOjB9Ym9keSAuZnVsbC1jb21taXQgLmJ0bi1vdXRsaW5lOm5vdCg6ZGlzYWJsZWQpOmhvdmVye2NvbG9yOiMwMDVjYzU7Ym9yZGVyLWNvbG9yOiMwMDVjYzV9Ym9keSBrYmR7ZGlzcGxheTppbmxpbmUtYmxvY2s7cGFkZGluZzozcHggNXB4O2ZvbnQ6MTFweCBTRk1vbm8tUmVndWxhcixDb25zb2xhcywiTGliZXJhdGlvbiBNb25vIixNZW5sbyxDb3VyaWVyLG1vbm9zcGFjZTtsaW5lLWhlaWdodDoxMHB4O2NvbG9yOiM0NDRkNTY7dmVydGljYWwtYWxpZ246bWlkZGxlO2JhY2tncm91bmQtY29sb3I6I2ZhZmJmYztib3JkZXI6MXB4IHNvbGlkICNkMWQ1ZGE7Ym9yZGVyLWJvdHRvbS1jb2xvcjojYzZjYmQxO2JvcmRlci1yYWRpdXM6M3B4O2JveC1zaGFkb3c6aW5zZXQgMCAtMXB4IDAgI2M2Y2JkMX1ib2R5IDpjaGVja2VkKy5yYWRpby1sYWJlbHtwb3NpdGlvbjpyZWxhdGl2ZTt6LWluZGV4OjE7Ym9yZGVyLWNvbG9yOiMwMzY2ZDZ9Ym9keSAudGFzay1saXN0LWl0ZW17bGlzdC1zdHlsZS10eXBlOm5vbmV9Ym9keSAudGFzay1saXN0LWl0ZW0rLnRhc2stbGlzdC1pdGVte21hcmdpbi10b3A6M3B4fWJvZHkgLnRhc2stbGlzdC1pdGVtIGlucHV0e21hcmdpbjowIC4yZW0gLjI1ZW0gLTEuNmVtO3ZlcnRpY2FsLWFsaWduOm1pZGRsZX1ib2R5IGhye2JvcmRlci1ib3R0b20tY29sb3I6I2VlZX0=';
  GITHUB_CSS = window.atob(GITHUB_CSS);
  return function (value) {
    var origin = window.location.origin;
    var script = [
      'window.addEventListener(\'message\', function (e) {',
      '  if (e.origin !== ' + JSON.stringify(origin) + ') {',
      '    throw new Error(\'Invalid origin\');',
      '  }',
      '  var blobs = e.data;',
      '  var urls = {};',
      '  [].slice.call(document.querySelectorAll(\'img[data-src]\')).forEach(function (img) {',
      '    var src = img.getAttribute(\'data-src\');',
      '    if (!blobs[src]) {',
      '      return;',
      '    }',
      '    urls[src] = urls[src] || URL.createObjectURL(blobs[src]);',
      '    img.setAttribute(\'src\', urls[src]);',
      '  });',
      '});'
    ].join('\n');
    var doc = CPHHelpers.generateMarkdownHTML(value);
    return {
      html: [
        '<html>',
          '<head>',
            '<meta charset="UTF-8">',
            '<script>', script, '</script>',
            '<style>',
              'body { padding: 16px; }',
              GITHUB_CSS,
            '</style>',
          '</head>',
          '<body>',
            doc.html,
          '</body>',
        '</html>'
      ].join(''),
      pathnames: doc.pathnames,
      callback: function (iframe, blobs) {
        iframe.contentWindow.postMessage(blobs, origin);
      }
    };
  };
})();

CPHHelpers.generateMarkdownHTML = function (value) {
  var pathnames = {};
  var html = DOMPurify.sanitize(marked(value)
    .replace(/<script/gi, '&lt;script')
    .replace(/<style/gmi, '&lt;style')
    .replace(/"javascript:/gi, '&quot;javascript')
    .replace(/href="\//gi, 'href="' + window.location.origin + '/')
    .replace(/<a/gi, '<a target="_blank"')
    .replace(/<img src="\.?\/(.*?)"/gi, function ($0, $1, $2) {
      pathnames[$1] = true;
      return '<img data-src="' + $1 + '"';
    }), {ADD_ATTR: ['target'], FORBID_TAGS: ['style'], FORBID_ATTR: ['style']});
  return {
    html: html,
    pathnames: Object.keys(pathnames)
  };
};

CPHHelpers.timeit = function timeit () {
  var t0 = new Date().valueOf();
  var t = 0;
  return function (msg) {
    var t1 = new Date().valueOf();
    console.log(msg || ++t, 'took ' + (t1 - t0) + 'ms');
    t0 = t1;
  }
};
