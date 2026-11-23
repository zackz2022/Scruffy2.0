// Add new showcase pictures here. Paths are relative to index.html.
const showcaseArtwork = [
  { image: "logo.png", caption: "Scruffy Butt Digital Designs · Brand artwork" },
  { image: "covers/book-21.webp", caption: "Digital Tools for a Smarter Better Life! · Book cover" },
  { image: "covers/book-54.webp", caption: "Sleep Optimization Blueprint · Book cover" },
  { image: "covers/book-36.webp", caption: "Communication Blueprint for Couples · Book cover" }
];

document.querySelectorAll("[data-showcase]").forEach(gallery => {
  const track = gallery.querySelector(".showcase-track");
  for (const artwork of showcaseArtwork) {
    const slide = document.createElement("figure");
    const image = document.createElement("img");
    const caption = document.createElement("figcaption");
    image.src = artwork.image;
    image.alt = "";
    image.loading = "lazy";
    caption.textContent = artwork.caption;
    slide.append(image, caption);
    track.append(slide);
  }

  const move = direction => {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: direction * track.clientWidth, behavior: reducedMotion ? "instant" : "smooth" });
  };

  gallery.querySelectorAll("[data-direction]").forEach(button => {
    button.addEventListener("click", () => move(Number(button.dataset.direction)));
  });
  track.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    move(event.key === "ArrowLeft" ? -1 : 1);
  });
});
