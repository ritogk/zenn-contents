const three = ref(3);
const object = {
  one: 1,
  two: 2,
  three: computed(() => {
    return this.status.value;
  }),
};
