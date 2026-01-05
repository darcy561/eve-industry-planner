self.addEventListener("push", (event) => {
  const data = event.data.json();
  console.log("Pushed received:", data);
  console.log(firebaseAppCheckToken);
  // event.waitUntil(updateApiData());
});

