document.addEventListener("DOMContentLoaded", function () {
  let settingsElement = document.getElementById("settings");
  let timeoutElement = document.getElementById("timeout");
  let saveMessageElement = document.createElement("div"); // Create a new div to display the save message

  chrome.storage.sync.get("timeout", function (data) {
    let timeout = (data.timeout || 30000) / 1000; // Divide by 1000 to convert milliseconds to seconds
    if (timeoutElement) {
      let timeoutInput = timeoutElement as HTMLInputElement;
      timeoutInput.value = timeout.toString(); // Set the input value to the timeout in seconds
    }
  });

  if (settingsElement && timeoutElement) {
    settingsElement.addEventListener("submit", function (event: Event) {
      event.preventDefault();
      let timeoutInput = timeoutElement as HTMLInputElement;
      let timeout = (Number(timeoutInput.value) || 30) * 1000; // Multiply by 1000 to convert seconds to milliseconds
      chrome.storage.sync.set({ timeout: timeout }, function () {
        console.log("Timeout value is set to " + timeout);

        // Display a save message
        saveMessageElement.textContent = "Settings saved!";
        saveMessageElement.style.color = "green";

        if (settingsElement) {
          settingsElement.appendChild(saveMessageElement);
        }

        // Remove the save message after 3 seconds
        setTimeout(function () {
          if (settingsElement) {
            settingsElement.removeChild(saveMessageElement);
          }
        }, 3000);
      });
    });
  }
});
