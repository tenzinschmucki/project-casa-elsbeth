(function () {
  "use strict";

  if (!window.jQuery) {
    return;
  }

  window.jQuery(function ($) {
    $(document).on("message:changed", function () {
      $("#message-box").hide().fadeIn(150);
    });

    $("#bookings-body").on("mouseenter", "tr", function () {
      $(this).addClass("row-highlight");
    });

    $("#bookings-body").on("mouseleave", "tr", function () {
      $(this).removeClass("row-highlight");
    });
  });
})();
