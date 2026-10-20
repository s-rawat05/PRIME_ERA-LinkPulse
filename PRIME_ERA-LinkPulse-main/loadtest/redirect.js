// k6 load test for the redirect hot path (https://k6.io).
//   BASE_URL=https://your-app.vercel.app CODE=your-alias k6 run loadtest/redirect.js
// Use an uncapped, unprotected test link. Requests use a browser user agent so they count as
// human clicks; they will appear in that link's analytics.
import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    redirects: { executor: "constant-arrival-rate", rate: 50, timeUnit: "1s", duration: "60s", preAllocatedVUs: 50, maxVUs: 200 },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{expected_response:true}": ["p(95)<300"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const CODE = __ENV.CODE || "monsoon-app";

export default function redirectScenario() {
  const res = http.get(`${BASE}/${CODE}`, {
    redirects: 0,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36" },
  });
  check(res, {
    "is 302": (r) => r.status === 302,
    "no-store": (r) => (r.headers["Cache-Control"] || "").includes("no-store"),
  });
}
