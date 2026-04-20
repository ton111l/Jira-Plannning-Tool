(function () {
  var STORAGE_KEY = "helpPageLang";
  var enEl = document.getElementById("help-content-en");
  var ruEl = document.getElementById("help-content-ru");
  var labelEl = document.getElementById("helpLangLabel");
  var btnEn = document.querySelector('[data-help-lang="en"]');
  var btnRu = document.querySelector('[data-help-lang="ru"]');
  var langGroup = document.getElementById("helpLangGroup");

  if (!enEl || !ruEl || !labelEl || !btnEn || !btnRu || !langGroup) {
    return;
  }

  var STR = {
    en: {
      title: "Instructions — Jira Planning Tool",
      langLabel: "Language:",
      ariaGroup: "Language"
    },
    ru: {
      title: "Инструкция — Jira Planning Tool",
      langLabel: "Язык:",
      ariaGroup: "Язык"
    }
  };

  function apply(lang) {
    var isEn = lang === "en";
    enEl.hidden = !isEn;
    ruEl.hidden = isEn;
    btnEn.setAttribute("aria-pressed", isEn ? "true" : "false");
    btnRu.setAttribute("aria-pressed", isEn ? "false" : "true");
    document.documentElement.lang = isEn ? "en" : "ru";
    document.title = isEn ? STR.en.title : STR.ru.title;
    labelEl.textContent = isEn ? STR.en.langLabel : STR.ru.langLabel;
    langGroup.setAttribute("aria-label", isEn ? STR.en.ariaGroup : STR.ru.ariaGroup);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_) {}
  }

  var saved = "en";
  try {
    saved = localStorage.getItem(STORAGE_KEY) || "en";
  } catch (_) {}
  if (saved !== "en" && saved !== "ru") {
    saved = "en";
  }
  apply(saved);

  btnEn.addEventListener("click", function () {
    apply("en");
  });
  btnRu.addEventListener("click", function () {
    apply("ru");
  });
})();
