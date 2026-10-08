import { predict } from "./station-orbits.mjs";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      requestId: data.requestId,
      results: data.elements.map((omm) => predict(omm, data.site, data.now)),
    });
  } catch (error) {
    self.postMessage({ requestId: data.requestId, error: error.message });
  }
};
