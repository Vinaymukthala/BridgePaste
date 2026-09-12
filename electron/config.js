// Single source for MockAPI.io endpoint.
module.exports = {
  MOCKAPI_URL:
    process.env.BRIDGEPASTE_MOCKAPI_URL ||
    "https://6aa515c81397053d42bb7237.mockapi.io/userdetails"
};
