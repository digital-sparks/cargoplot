import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import { SplitText } from 'gsap/SplitText';
gsap.registerPlugin(Observer, SplitText);

window.Webflow ||= [];
window.Webflow.push(() => {
  console.log('hello');
});
