import BubbleForce from "./BubbleForce";
import RadialWheel from "./RadialWheel";
import WordCloud from "./WordCloud";

const visualizations = {
  bubbles: { component: BubbleForce, label: "Bubbles" },
  radial: { component: RadialWheel, label: "Wheel" },
  cloud: { component: WordCloud, label: "Cloud" },
};

export default visualizations;
