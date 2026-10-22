(() => {
  const root = document.documentElement;
  const initial = new URLSearchParams(location.search).get("theme");
  const apply = (value) => {
    root.dataset.theme = value === "inverse" ? "inverse" : "original";
    document.querySelector('meta[name="theme-color"]').content =
      value === "inverse" ? "#000000" : "#ffffff";
  };
  apply(initial);
  document.addEventListener("DOMContentLoaded", () => {
    const select = document.querySelector("#colour-theme");
    select.value = root.dataset.theme;
    select.addEventListener("change", () => {
      apply(select.value);
      const url = new URL(location.href);
      if (select.value === "inverse") url.searchParams.set("theme", "inverse");
      else url.searchParams.delete("theme");
      history.replaceState(null, "", url);
    });
  });
})();
