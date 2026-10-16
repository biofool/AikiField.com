(function () {
  var endpoint = '/games/exercises/auth-state.php';

  fetch(endpoint, { credentials: 'same-origin' })
    .then(function (response) {
      if (!response.ok) throw new Error('auth-state HTTP ' + response.status);
      return response.json();
    })
    .then(function (state) {
      if (!state.authed) return;

      document.querySelectorAll('[data-auth-label]').forEach(function (element) {
        element.textContent = element.dataset.authLabel;
      });
      document.querySelectorAll('[data-auth-hide]').forEach(function (element) {
        element.hidden = true;
      });
    })
    .catch(function (error) {
      console.error('Digital Experience auth-state check failed', error);
    });
})();
