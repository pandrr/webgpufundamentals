Title: WebGPU Compute Shaders - Image Histogram Part 2
Description: Using an image histogram to adjust video in real time.
TOC: Image Histogram Part 2

In [the previous article](webgpu-compute-shaders-histogram.html) we covered
how to make an image histogram in JavaScript and then converted it to use WebGPU
and went through several steps of optimizing it.

Let's do a few more things with it

## Generate 4 histograms at once.

Given an image like this

<div class="center">
  <div>
    <div><img src="../resources/images/pexels-francesco-ungaro-96938-mid.jpg" style="max-width: 700px;"></div>
    <div style="text-align: center;"><a href="https://www.pexels.com/photo/cute-kitten-hiding-behind-a-pillow-96938/">Photo by Francesco Ungaro</a></div>
  </div>
</div>

It's common to generate multiple histograms

<div class="webgpu_center side-by-side">
  <div>
    <div><img src="resources/histogram-colors-photoshop.png" style="width: 237px;" class="nobg"></div>
  </div>
  <div>
    <div><img src="resources/histogram-luminosity-photoshop.png" style="width: 237px;" class="nobg"> </div>
  </div>
</div>

On the left we have 3 histograms, one for red values, one for green, and one for blue. They're drawn
to overlap. On the right we have a luminance histogram like the one we generated in  [the previous article](webgpu-compute-shaders-histogram.html).

It's a tiny change to generate all 4 at once.

In JavaScript, here
