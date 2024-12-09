self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SET_APP_CHECK_TOKEN") {
    firebaseAppCheckToken = event.data.token;
  }
});

async function requestAppCheckToken() {
  try {
    const allClients = await clients.matchAll();

    for (const client of allClients) {
      await client.postMessage({ type: "REQUEST_APP_CHECK_TOKEN" });
    }
  } catch (err) {
    console.error(err);
  }
}
