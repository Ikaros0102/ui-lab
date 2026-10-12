// ui/toast.js
// Modern non-intrusive toast notification using Popover API and top-layer animation.

const toaster = document.getElementById("toaster");

export function showToast(message = "Copied to clipboard!") {
  if (!toaster) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span>${message}</span>
  `;

  toaster.appendChild(toast);

  // If toaster is a popover, show it
  if (toaster.showPopover && !toaster.matches(":popover-open")) {
    try {
      toaster.showPopover();
    } catch {
      // Fallback
    }
  }

  setTimeout(() => {
    toast.classList.add("is-leaving");
    toast.addEventListener("transitionend", () => {
      toast.remove();
      if (toaster.children.length === 0 && toaster.hidePopover) {
        try {
          toaster.hidePopover();
        } catch {
          // Ignore
        }
      }
    }, { once: true });
  }, 1800);
}
