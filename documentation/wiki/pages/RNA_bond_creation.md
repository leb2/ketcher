| As                          | I want                            | so that                                                      |
| :-------------------------- | :-------------------------------- | :----------------------------------------------------------- |
| Ketcher peptide editor user | to add bonds between RNA monomers | I can reflect atom connections existing in real life molecules with the RNA monomers |

#### 1. Context

Glossary: [Peptide Glossary](https://github.com/epam/ketcher/wiki/Polymer-Glossary) 

RNA chain has backbone part that consists a sequence of the Sugars and Phosphates alternating. Sugar has enough connection points to connect with additional monomer that is called branch one. For RNA chain it will be Nucleobase. Each RNA monomer separately is considered a RNA chain, but their non-valid structures are not. Those non-valid situations will be handled differently: some type of connections can not even be established on the canvas, while the other ones can be drawn, but the structures will not be represented in HELM notation and alignment rules will not be applied for them.  

#### 3. Assumptions

| **ID** | **Assumption**                                               |
| ------ | ------------------------------------------------------------ |
| 1      | Ketcher Polymer Editor users are mostly focused on creating the RNA chains that valid and have the connections reflecting the real RNA structure |
| 2      | RNA chains can be quite long and contain dozens of backbone monomers |
|        |                                                              |

####  4. Additional information (optional)



#### 8. Acceptance Criteria



| **#** | **User Group**              | **GIVEN**                                                    | **WHEN**                       | **THEN**                                                     |
| ----- | --------------------------- | ------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------ |
| 1     | Ketcher Polymer editor User | There are at least 2 RNA monomers on the canvas with at least 1 empty connection point for each of them <br> AND one of the monomers is in the beginning of the RNA chain <br> AND <br>other one is in the end of another RNA chain  <br>(see the definition of beginning and end of the chain in [Polymer Glossary](https://github.com/epam/ketcher/wiki/Polymer-Glossary)) | dragging from one to the other | Ketcher visualize the line representing the peptide bond on the canvas when dragging<br/>AND<br/>when dropping Ketcher visualize the line from one monomer to the other on the canvas with the ends attached to monomers<br/>AND<br/>Ketcher aligns the monomers in accordance with the Business Rules table <br/>AND<br/>Ketcher creates bond<br/>AND<br/>Ketcher selects empty connection points from each of the monomers and marks them as occupied <br> |
| 1.1.  |                             | Conditions from the no1. are fulfilled <br> AND <br> both monomers are Backbone ones of different types (one is Sugar, the other one is Phosphate)  OR both the monomers are Phosphate in the chain that is longer than 1 monomer | dragging from one to the other | Ketcher uses R2 connection point from the monomer in the end of the chain and R1 connection point from the monomer in the beginning of the chain to create the bond <br>AND<br>Ketcher considers the result structure as a single chain and remunerates the monomers in it in accordance with the rules |
| 1.2   |                             | Conditions from no1.  <br> AND <br> both those monomers are Sugar ones | dragging from one to the other | Ketcher adds Phosphate monomer that is selected on Phosphate monomer tab (or default Phosphate monomer p if there is no selected Phosphate monomer) between the Sugar monomers user is trying to link <br> AND <br> Ketcher uses R1 and R2 connection points to create the bonds for standard backbone structure of RNA chain <br> AND <Br> Ketcher considers result structure as a single chain <br> AND <br> Ketcher remunerates monomers in the new single chain in accordance with the rule |
| 1.3   |                             | Conditions from no1. <br/> AND <br/> one of those monomers is Nucleobase and the other one is Phosphate (Nucleobase can be the end or beginning of the chain only if the whole chain consists of it) | dragging from one to the other | Ketcher uses R2 connection point from the monomer in the end of the chain and R1 connection point from the monomer in the beginning of the chain to create the bond <br/>AND<br/>Ketcher considers the result structure as a single chain and remunerates the monomers in it in accordance with the rules |
| 1.4   |                             | Conditions from no1 <br>AND<br>both of the monomer are the backbone ones at the end of one RNA chain | dragging from one to the other | Ketcher creates bond using R1 and R2 connection points <br>AND<br>displays the chain with circle structure |
| 2     |                             | There are at least 2 RNA monomers on the canvas with at least 1 empty connection point for each of them <br/> AND one of the monomers is Sugar in the center of the backbone part of RNA chain <br/> AND <br/>other one is in the center or end of the backbone part of another RNA chain  <br/>(*1. see the definition of beginning and end of the chain in [Polymer Glossary](https://github.com/epam/ketcher/wiki/Polymer-Glossary) <br>2. Phosphates have only 2 connection points, so they can't be in the center of the chain and still have connection points empty*) | dragging from one to the other | Ketcher visualize the line representing the peptide bond on the canvas when dragging<br/>AND<br/>when dropping Ketcher visualize the line from one monomer to the other on the canvas with the ends attached to monomers<br/>AND<br/>Ketcher aligns the monomers in accordance with the Business Rules table <br/>AND<br/>Ketcher creates bond<br/>AND<br/>Ketcher selects empty connection points from each of the monomers and marks them as occupied <br/> |
| 2.1   |                             | Conditions from no. 2 <br> AND <br> the other monomer is Phosphate with only one connection point empty *(this means it is on the end of the chain that includes more than 1 monomer)* | dragging from one to the other | Ketcher uses R3 connection point from the monomer in the center of the chain and empty connection point from the monomer in the beginning/end of the chain to create the bond <br/>AND<br/>Ketcher considers the result structure as a separate chains and does not remunerate the monomers in it in accordance with the rules |
| 2.2   |                             | Conditions from no.2 <br>AND <br>the other monomer is Sugar in the end or beginning of the chain with more than 1 connection point empty *(this includes cases when this is single monomer OR it has the backbone connection but does not have Nucleobase linked to it OR it has Nucleobase linked but no backbone connections)* | dragging from one to the other | Ketcher displays dialog window with suggestion to select the connection points <br> AND <br> allows to select the empty connection point that should be used to create bond <br> AND <br> once the point is selected and confirmed Ketcher creates the bond with the connection point selected  <br> AND <br> Ketcher considers result as a separate chains and does not remunerate the monomers in it in accordance with the rules and aligns them in accordance with the rules |
| 2.3   |                             | Conditions from no.2<br> AND<br>the other monomer is Sugar in the center of the chain OR in the beginning or end of the chain with only 1 connection point empty *(this means this Sugar is on the end of the chain and has a Nucleobase linked to it*) | dragging from one to the other | Ketcher uses R3 connection point from the monomer in the center of the chain and empty connection point from the monomer in the beginning/end (it might be R1 or R2) of the chain to create the bond <br/>AND<br/>Ketcher considers the result structure as a separate chains and does not remunerate the monomers in it in accordance with the rules |
| 2.4   |                             | Conditions from no 2.  <br/> AND <br/>other one is the RNA Nucleobase monomer  <br/>(*1. see the definition of beginning and end of the chain in [Polymer Glossary](https://github.com/epam/ketcher/wiki/Polymer-Glossary) <br/>2. Nucleobases have only 1 connection point, so they can bond with other monomers only being single monomers on the canvas*) | dragging from one to the other | Ketcher creates bond using Sugar's R3 connection point and single connection point of the Nucleobase<br/>AND<br/>Ketcher considers result as a single RNA chain with Nucleobase monomer as branch element of the chain<br> AND <br> Ketcher aligns monomers on the canvas in accordance with the rules |
| 2.5   |                             | Conditions from no.2 <br> AND <br> the other one is the Sugar in the beginning\end or center of the same chain with only one connection point empty OR is Phosphate in the end of the chain *(this is for cases when Sugar is in the beginning/end or in the center with no Nucleobase attached)* | dragging from one to the other | Ketcher creates bond using Sugar's R3 connection point and single connection point of the second Sugar <br/>AND<br/>Ketcher considers result as a single RNA chain <br/> AND <br/> Ketcher aligns monomers on the canvas in accordance with the rules with displaying the circle structure |
| 2.6   |                             | Conditions from no.2 <br/> AND <br/> the other one is the Sugar in the beginning\end of the same chain with more than 1 connection point empty  *(this is for cases when Sugar is in the beginning/end with no Nucleobase attached)* | dragging from one to the other | Ketcher displays dialog window with suggestion to select the connection points <br/> AND <br/> allows to select the empty connection point that should be used to create bond <br/> AND <br/> once the point is selected and confirmed Ketcher creates the bond with the connection point selected  <br/> AND <br/> Ketcher considers result as a singe chain and does not remunerate the monomers in it in accordance with the rules and aligns them in accordance with the rules displaying the circle structure |