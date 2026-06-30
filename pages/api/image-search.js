const {searchImages} = require('../../server/image-search')

export default async (req, res) => {
  try {
    const result = await searchImages(req.query.q)
    return res.status(200).json(result)
  } catch (e) {
    return res.status(400).send(e.toString())
  }
}
