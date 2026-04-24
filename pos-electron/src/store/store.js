import { configureStore } from "@reduxjs/toolkit";
import billingReducer from "./slices/billingSlice.js";

export const store = configureStore({
  reducer: {
    billing: billingReducer
  }
});
