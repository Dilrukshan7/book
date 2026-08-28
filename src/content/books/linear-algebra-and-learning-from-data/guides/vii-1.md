---
title: The Construction of Deep Neural Networks
section: VII.1
summary: >-
  Where the whole book has been heading. A deep network is an alternating stack
  of linear maps and one simple nonlinearity, and its expressive power comes
  from counting the flat pieces that stack creates.
readingMinutes: 8
---

## The one idea

A neural network is a function `F(x, v)`: `x` is the input you want a
prediction for, `v` is the enormous pile of weights you are trying to learn.
Strip away the vocabulary and the construction is repetitive:

```
apply an affine map  →  apply a nonlinearity  →  repeat
```

Layer `k` computes `Aₖ x + bₖ` and then applies **ReLU**, the function
`max(0, ·)`, entry by entry. Stack `L` of those and you have a deep network.

Two observations do most of the work in this section:

**Without the nonlinearity, depth buys nothing.** Compose affine maps and you
get an affine map: `A₂(A₁x + b₁) + b₂` is just `Ax + b`. A hundred layers with
no ReLU has exactly the expressive power of one layer. The nonlinearity is not
a detail; it is the entire reason depth exists.

**With ReLU, the result is continuous and piecewise linear.** Every ReLU either
passes its input through or zeroes it. Fix which choice each unit makes and the
whole network collapses to a single affine map on that region of input space.
So `F` carves the input space into flat pieces and is linear on each. Learning
means positioning those folds.

## The counting argument

Strang's angle here is combinatorial rather than statistical: **how many flat
pieces can a network make?**

Each of the `N` units in a layer contributes a hyperplane where it switches
between passing and zeroing. `N` hyperplanes cut `R^m` into

```
r(N, m) = C(N,0) + C(N,1) + ⋯ + C(N,m)
```

regions, not `2^N`, because the hyperplanes are not independent, and this
matters. Compose layers and the counts multiply, which is where depth earns its
keep: **adding a layer multiplies the number of pieces, adding width only adds
to it.** That is a concrete, countable reason to prefer depth, and it needs no
probability theory at all.

The free companion PDF, *Counting Parameters*, works through these counts in
more detail and is worth reading alongside this section.

## What the rest of the book was for

This is the section where the earlier parts cash out:

- **Part I**: each layer *is* a matrix. Its rank determines how much
  information can survive the layer; its singular values determine whether
  signals are amplified or crushed as they propagate. A layer whose `σ₁` is
  large and `σᵣ` tiny is where exploding and vanishing gradients come from.
- **Part III**: low-rank structure explains why networks compress so well and
  why a giant weight matrix can often be factored with negligible loss.
- **Part VI**: the actual training is gradient descent (VI.4) and SGD/ADAM
  (VI.5) on this `F`. VII.3's backpropagation is the chain rule organised to
  compute those gradients efficiently.
- **Part V**: the loss is an expectation, and SGD's convergence is a
  probabilistic statement.

If a section in Parts I-VI felt unmotivated, this is the place it pays off.

## What to actually do

1. Draw a network with 2 inputs, one hidden layer of 3 ReLU units, and 1
   output. Label every weight and bias. Count them. That count is `dim(v)`.
2. On paper, pick weights and shade the regions of the 2-D input plane where
   each hidden unit is active. You should see the plane cut by 3 lines. Count
   the regions and check against `r(3, 2) = 1 + 3 + 3 = 7`.
3. Verify that one of your regions really does produce a plain affine function
   of `x`: pick two points inside it and confirm the output is linear along
   the segment between them.
4. In numpy, implement the forward pass as an explicit loop of
   `x = np.maximum(0, A @ x + b)`. Seeing that there is nothing else to it is
   the point.

## Check yourself

- Why does removing every ReLU reduce a 50-layer network to one affine map?
- Why is the piece count `r(N, m)` rather than `2^N`?
- What does the rank of a weight matrix say about that layer?
- Depth versus width: which multiplies the number of linear pieces?

## Common sticking points

**Thinking ReLU is chosen because it is biologically realistic.** It is chosen
because it is cheap, keeps gradients from vanishing on the positive side, and
produces exactly the piecewise-linear structure this section analyses.

**Confusing the two arguments of `F(x, v)`.** During training, `x` is fixed by
your data and you differentiate with respect to `v`. At inference, `v` is
frozen and `x` varies. Same function, opposite variable held still. Mixing
them up makes backpropagation impossible to follow in VII.3.

---

This is the third and last section MIT publishes in full. Read Strang's own
text here. It is the summary of the whole book, and it is free.
