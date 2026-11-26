# Confirmed proposals for dataset review

Each entry records a reviewed candidate that corrects a material issue in the supplied references. The dataset revision and row IDs belong to the frozen sample. Recheck the current row against its original text and all alternatives before applying a correction.

## drawing/scenes-03.csv#3639

make her shirt red

**Proposed by** prolog-worlds, prolog-example-transfer

**Annotation issue** Reference 1 "attribute=part.owner value=girl words=her" — This restricts the owner to a girl. The pronoun “her” identifies the owner through context and supplies no age category.

**Grounding** The candidate sets the shirt’s color to red and preserves the possessive reference to its owner. The source reads "her shirt red". The candidate encodes "description=\"her shirt\" sort=\"shirt\"".

### Proposed circuit

```sop
@r1 w.request.request act="change" mood=do predicate="make" words="make her shirt red"
@r1.t w.request.target request=$r1 family="drawn" mode=existing fill=description determiner=possessive description="her shirt" sort="shirt" sort_words="shirt"
@r1.c w.request.constraint request=$r1 on=attribute attribute="drawn.colour" value=red operator=eq phase=result
@r1.l w.request.lookup request=$r1 target=$r1.t key=thing from=page
```

### Existing reference circuits

```sop
@r1 w.request.request act=change mood=do predicate=make
@r1.t w.request.target request=$r1 family=part mode=existing determiner=possessive fill=description sort=shirt
@r1.c1 w.request.constraint request=$r1 on=attribute attribute=part.colour value=red operator=eq phase=result
@r1.c2 w.request.constraint request=$r1 on=attribute attribute=part.owner value=girl words=her operator=eq phase=result
```

## diagram/charts-01.csv#1651

right, a bar chart showing the staff split by building

**Proposed by** prolog-example-transfer

**Annotation issue** Reference 1 "attribute=node.position value=right operator=eq phase=result open_value=true" — This turns the opening acknowledgment into a requirement to place the chart on the right.

**Grounding** The candidate requests a bar chart of staff grouped by building. The opening “right,” is an acknowledgment. The source reads "right, a bar chart showing the staff split by building". The candidate encodes "attribute=chart.dimension value=building operator=eq phase=result words=\"split by building\"".

### Proposed circuit

```sop
@r1 w.request.request act=make mood=do
@r1.t w.request.target request=$r1 family=chart mode=new determiner=indefinite
@r1.c1 w.request.constraint request=$r1 on=attribute attribute=chart.type value=bar words="bar chart" operator=eq phase=result
@r1.c2 w.request.constraint request=$r1 on=attribute attribute=chart.dimension value=building operator=eq phase=result words="split by building"
@r1.m1 w.request.constraint request=$r1 on=attribute attribute=chart.measure value=staff operator=eq phase=result
```

### Existing reference circuits

```sop
@r1 w.request.request act=make mood=do
@r1.t w.request.target request=$r1 family=chart mode=new determiner=indefinite
@r1.c1 w.request.constraint request=$r1 on=attribute attribute=chart.type value=bar words="bar chart" operator=eq phase=result
@r1.c2 w.request.constraint request=$r1 on=attribute attribute=chart.dimension value=building operator=eq phase=result words="split by building"
@r1.c3 w.request.constraint request=$r1 on=attribute attribute=node.position value=right operator=eq phase=result open_value=true
@r1.u1 w.request.unread request=$r1 note=chart.presentation text="showing the staff split"
@r1.c4 w.request.constraint request=$r1 on=attribute attribute=chart.measure value=staff operator=eq phase=result
```
