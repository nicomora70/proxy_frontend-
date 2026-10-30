document.documentElement.classList.add("js");

window.APP_CONFIG = {
  API_BASE: (window.location.protocol === "file:" ||
    window.location.port === "5500" ||
    window.location.port === "8000" ||
    window.location.port === "8081")
    ? "http://127.0.0.1:8080/api"
    : "/api"
};
