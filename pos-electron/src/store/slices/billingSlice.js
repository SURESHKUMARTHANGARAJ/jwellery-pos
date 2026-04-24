import { createSlice } from "@reduxjs/toolkit";

const billingSlice = createSlice({
  name: "billing",
  initialState: {
    cart: []
  },
  reducers: {
    addItem(state, action) {
      const product = action.payload;
      const existing = state.cart.find((x) => x.id === product.id);
      if (existing) {
        existing.quantity += 1;
      } else {
        state.cart.push({
          ...product,
          quantity: 1
        });
      }
    },
    removeItem(state, action) {
      state.cart = state.cart.filter((x) => x.id !== action.payload);
    },
    clearCart(state) {
      state.cart = [];
    }
  }
});

export const { addItem, removeItem, clearCart } = billingSlice.actions;
export default billingSlice.reducer;
